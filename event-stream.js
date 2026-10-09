(function attachCyrusEventStream(root) {
  "use strict";

  const DEFAULT_MAX_RECONNECTS = 5;
  const DEFAULT_BASE_DELAY_MS = 250;
  const DEFAULT_MAX_DELAY_MS = 4000;

  function makeAbortError() {
    const error = new Error("Event stream subscription aborted");
    error.name = "AbortError";
    return error;
  }

  function delay(ms, signal) {
    if (signal && signal.aborted) return Promise.reject(makeAbortError());
    return new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => {
        if (signal) signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        clearTimeout(timer);
        cleanup();
        reject(makeAbortError());
      };
      timer = setTimeout(() => {
        cleanup();
        resolve();
      }, ms);
      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      }
    });
  }

  async function readEventStream(body, signal, initialEventId, onState, onTrace) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let eventName = "message";
    let eventId = null;
    let data = [];
    let lastEventId = initialEventId;
    let closeStatus = null;
    let shouldStop = false;

    const resetEvent = () => {
      eventName = "message";
      eventId = null;
      data = [];
    };

    const dispatch = () => {
      if (eventId !== null && !eventId.includes("\u0000")) lastEventId = eventId;
      if (!data.length) {
        resetEvent();
        return;
      }

      let payload;
      try {
        payload = JSON.parse(data.join("\n"));
      } catch {
        resetEvent();
        return;
      }

      if (eventName === "state") onState(payload);
      if (eventName === "trace") onTrace(payload);
      if (eventName === "close") {
        closeStatus = typeof payload.status === "string" ? payload.status : "CLOSED";
        shouldStop = true;
      }
      resetEvent();
    };

    const processLine = line => {
      if (line === "") {
        dispatch();
        return;
      }
      if (line.startsWith(":")) return;
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("id:")) {
        const candidate = line.slice(3).trimStart();
        if (!candidate.includes("\u0000")) eventId = candidate;
      } else if (line.startsWith("data:")) {
        data.push(line.slice(5).trimStart());
      }
    };

    try {
      while (!shouldStop) {
        if (signal && signal.aborted) throw makeAbortError();
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) {
          processLine(line);
          if (shouldStop) break;
        }
      }
      return { lastEventId, closeStatus };
    } finally {
      try {
        await reader.cancel();
      } catch {
        // The server may already have closed the stream.
      }
      reader.releaseLock();
    }
  }

  async function streamTaskEvents(taskId, signal, onState, onTrace, options = {}) {
    const maxReconnects = Number.isInteger(options.maxReconnects)
      ? Math.max(0, Math.min(options.maxReconnects, 10))
      : DEFAULT_MAX_RECONNECTS;
    const baseDelayMs = Number.isFinite(options.baseDelayMs)
      ? Math.max(0, options.baseDelayMs)
      : DEFAULT_BASE_DELAY_MS;
    const maxDelayMs = Number.isFinite(options.maxDelayMs)
      ? Math.max(baseDelayMs, options.maxDelayMs)
      : DEFAULT_MAX_DELAY_MS;

    let lastEventId = "";
    let reconnects = 0;
    let lastError = null;

    while (true) {
      if (signal && signal.aborted) throw makeAbortError();
      try {
        const headers = { Accept: "text/event-stream" };
        if (lastEventId) headers["Last-Event-ID"] = lastEventId;
        const response = await root.fetch(
          "/api/tasks/" + encodeURIComponent(taskId) + "/stream",
          { headers, signal }
        );
        if (!response.ok || !response.body) {
          throw new Error("Live event stream unavailable (HTTP " + response.status + ")");
        }

        const result = await readEventStream(response.body, signal, lastEventId, onState, onTrace);
        lastEventId = result.lastEventId;
        if (result.closeStatus && result.closeStatus !== "STREAM_TIMEOUT") return;
        lastError = new Error(
          result.closeStatus === "STREAM_TIMEOUT"
            ? "Event stream lease expired"
            : "Event stream ended before a close event"
        );
      } catch (error) {
        if ((signal && signal.aborted) || error.name === "AbortError") throw error;
        lastError = error;
      }

      if (reconnects >= maxReconnects) {
        throw new Error(
          "Event stream disconnected after " + (reconnects + 1) +
          " attempts: " + (lastError ? lastError.message : "unknown stream error")
        );
      }
      reconnects += 1;
      const backoff = Math.min(baseDelayMs * (2 ** (reconnects - 1)), maxDelayMs);
      await delay(backoff, signal);
    }
  }

  root.CyrusEventStream = Object.freeze({ streamTaskEvents });
})(typeof window !== "undefined" ? window : globalThis);
