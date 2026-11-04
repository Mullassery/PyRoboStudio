def main() -> None:
    """Console entry point: run the sidecar server on 127.0.0.1:8787."""
    import uvicorn

    uvicorn.run("pyrobostudio_sidecar.server:app", host="127.0.0.1", port=8787)
