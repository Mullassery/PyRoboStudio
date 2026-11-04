# pyrobostudio-sidecar

Python data sidecar for [PyRoboStudio](https://github.com/Mullassery/PyRoboStudio):
a read-only FastAPI service that serves recorded robotics sessions, adapter views
of PyRobo* repositories, mission manifests, and a Foxglove WebSocket transport.

```sh
uvx pyrobostudio-sidecar        # serves 127.0.0.1:8787
```

Read-only by design: the sidecar never publishes to robots or writes to source
repositories. See the main repository for architecture, security model, and docs.
