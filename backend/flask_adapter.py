"""Optional Flask façade for teams embedding CYRUS inside a Flask application.

The FastAPI service in main.py is the canonical implementation. This tiny adapter is
an integration reference, not a second source of workflow state.
"""
from flask import Flask, jsonify


def create_app() -> Flask:
    app = Flask(__name__)

    @app.get("/api/health")
    def health():
        return jsonify({
            "status": "ok",
            "service": "cyrus-flask-adapter",
            "note": "Use the canonical FastAPI service for persistent runs.",
        })

    @app.get("/api/frameworks")
    def frameworks():
        return jsonify({
            "primary_api": "FastAPI",
            "optional_integrations": ["Flask", "Django REST Framework"],
            "database_adapters": ["SQLite", "PostgreSQL", "MySQL"],
        })

    return app


if __name__ == "__main__":
    create_app().run(host="127.0.0.1", port=5000, debug=False)
