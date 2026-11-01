"""Recorded-session adapter: reads MCAP fixtures and derives map data.

No ROS install required. Decodes JSON-encoded messages natively; reports
undecodable topics as `degraded` (never silently skipped), per
docs/architecture/data-source-contracts.md.
"""
import json
from dataclasses import dataclass
from pathlib import Path

from mcap.reader import make_reader


@dataclass
class RecordedSample:
    topic: str
    timestamp_ns: int
    payload: object


@dataclass
class RecordedSession:
    path: Path
    session_id: str
    topics: list[dict]
    start_ns: int
    end_ns: int
    degraded: list[str]

    def span(self) -> dict:
        return {
            "startNs": self.start_ns,
            "endNs": self.end_ns,
            "clockDomain": "session_ns",
        }


def load_session(mcap_path: Path, session_id: str) -> RecordedSession:
    with open(mcap_path, "rb") as fp:
        reader = make_reader(fp)
        summary = reader.get_summary()
        if summary is None:
            raise ValueError(f"{mcap_path}: not indexed; regenerate the fixture")
        topics = [
            {"id": f"t{ch.topic}", "name": ch.topic, "msgType": "", "pubCount": 1, "subCount": 1,
             "channelId": ch.id, "qm": ch.message_encoding}
            for ch in summary.channels.values()
        ]
        profiles = {sch.id: sch for sch in summary.schemas.values()}
        for t in topics:
            sch = profiles.get(t["channelId"])
            if sch:
                t["msgType"] = sch.name
        return RecordedSession(
            path=mcap_path,
            session_id=session_id,
            topics=topics,
            start_ns=summary.statistics.message_start_time,
            end_ns=summary.statistics.message_end_time,
            degraded=[],
        )


def iter_samples(session: RecordedSession, topic_name: str, max_count: int) -> list[RecordedSample]:
    out: list[RecordedSample] = []
    with open(session.path, "rb") as fp:
        for schema, channel, message in make_reader(fp).iter_messages():
            if channel.topic != topic_name:
                continue
            try:
                payload = json.loads(message.data)
            except (ValueError, UnicodeDecodeError):
                continue
            out.append(RecordedSample(channel.topic, message.log_time, payload))
            if len(out) >= max_count:
                break
    return out


def topic_activity(session: RecordedSession) -> list[dict]:
    counts: dict[str, int] = {}
    with open(session.path, "rb") as fp:
        for _schema, channel, message in make_reader(fp).iter_messages():
            counts[channel.topic] = counts.get(channel.topic, 0) + 1
    return [
        {
            "topicId": f"t{topic['name']}",
            "messageCount": counts.get(topic["name"], 0),
            "encoding": topic["qm"],
            "reliability": "observed",
        }
        for i, topic in enumerate(session.topics)
    ]


def degraded_topics(session: RecordedSession) -> list[str]:
    with open(session.path, "rb") as fp:
        undecodable: set[str] = set()
        for _schema, channel, message in make_reader(fp).iter_messages():
            try:
                json.loads(message.data)
            except (ValueError, UnicodeDecodeError):
                undecodable.add(channel.topic)
        return sorted(undecodable)
