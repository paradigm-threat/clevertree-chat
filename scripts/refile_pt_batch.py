#!/usr/bin/env python3
"""Refile Paradigm Threat pages under sub-axis rules.

Reads existing comment bodies on the comments branch. Does not rewrite raw
chat/public logs. Does not remint user UUIDs. Leaves pages/try alone.
"""

from __future__ import annotations

import json
import re
import shutil
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from clevertree_chat.classify import is_non_argument  # noqa: E402

REPO = Path("/home/ari/dev/clevertree-chat-comments")
RULE = "posted"
SKIP_PAGES = frozenset({"try"})

# primary_key, file_confidence, summary, summary_confidence, unwritten_counter
ROOMS: dict[str, tuple[str, str, str, str, str]] = {
    "5g": ("", "low", "These posts do not form one distinct argument.", "low", ""),
    "censorship": (
        "speech-control",
        "high",
        "Governments and platforms are closing encryption, reporting, and ordinary speech.",
        "high",
        "speech-left-open",
    ),
    "chronology": (
        "rewritten-past",
        "high",
        "The accepted timeline of scripture, saints, and the earth was rewritten.",
        "high",
        "timeline-holds",
    ),
    "communism": (
        "party-state",
        "high",
        "Communist party-states are control systems, not a worker government that won.",
        "high",
        "party-delivered",
    ),
    "controlled-opposition": (
        "managed-dissent",
        "high",
        "Public dissent on these figures is managed by the same power it claims to oppose.",
        "high",
        "genuine-dissent",
    ),
    "cosmology": (
        "saturnian-cosmos",
        "high",
        "Saturn, Mars, and Venus, not the textbook solar system, shaped the recent earth.",
        "high",
        "standard-orbits",
    ),
    "deep-state": (
        "bloodline-rule",
        "high",
        "A clandestine royal bloodline runs towns and states inside its reach.",
        "high",
        "no-bloodline",
    ),
    "development": ("", "high", "These posts are not an argument.", "low", ""),
    "ech-in-time": ("", "low", "These posts do not form one distinct argument.", "low", ""),
    "election": (
        "stolen-count",
        "high",
        "Recent US counts were interfered with and then protected in court.",
        "high",
        "count-held",
    ),
    "forgotten-future": ("", "low", "These posts do not form one distinct argument.", "low", ""),
    "general": ("", "high", "These posts do not form one distinct argument.", "low", ""),
    "genocide": ("", "low", "These posts do not form one distinct argument.", "low", ""),
    "geoengineering": (
        "block-the-sun",
        "high",
        "Programs are already dimming the sun and steering weather.",
        "high",
        "weather-natural",
    ),
    "giants-and-faeries": ("", "low", "These posts do not form one distinct argument.", "low", ""),
    "hollow-earth": (
        "inner-earth",
        "low",
        "A buried world or inner exit sits under the ice and the crust.",
        "low",
        "solid-crust",
    ),
    "maps": (
        "flat-earth",
        "low",
        "Some posts say the useful map is a flat azimuthal earth.",
        "low",
        "globe-measured",
    ),
    "mars": (
        "earth-from-mars",
        "high",
        "Humans on Mars hold a technological lead and use it on Earth.",
        "high",
        "mars-empty",
    ),
    "memes": ("", "low", "These posts do not form one distinct argument.", "low", ""),
    "mind-control": (
        "mkultra-program",
        "low",
        "Institutional mind-control programs are still the frame for these accounts.",
        "low",
        "therapy-only",
    ),
    "mudflood": (
        "mudflood-reset",
        "high",
        "A mud flood and a pole shift buried a recent civilization.",
        "high",
        "ordinary-sediment",
    ),
    "nukes": (
        "nuclear-hoax",
        "high",
        "The public nuclear story, including Hiroshima, is a cover for other weapons.",
        "high",
        "bombs-fell",
    ),
    "off-topic": ("", "high", "These posts are not an argument.", "low", ""),
    "philadelphia-experiment": (
        "ship-displaced",
        "high",
        "The experiment moved the ship. It did not open another dimension.",
        "high",
        "",
    ),
    "planned-obsolescence": ("", "low", "These posts do not form one distinct argument.", "low", ""),
    "podcasts": ("", "low", "These posts are not an argument.", "low", ""),
    "predictive-programming": (
        "story-seeding",
        "low",
        "Fiction and news are seeding events the authors treat as later plans.",
        "low",
        "stories-entertain",
    ),
    "pyramidal-empire": ("", "low", "These posts do not form one distinct argument.", "low", ""),
    "reset-agenda": (
        "great-reset",
        "high",
        "Resets are repeated on purpose so the same class can reissue the world.",
        "high",
        "no-reset",
    ),
    "rus-horde-tartaria": (
        "tartary-reset",
        "low",
        "A Tartary or Horde world was renamed and reset into the modern map.",
        "low",
        "tartary-myth",
    ),
    "science-fiction": (
        "space-staged",
        "low",
        "Public spaceflight imagery is staged more often than it is flown.",
        "low",
        "launches-real",
    ),
    "songwalker": ("", "low", "These posts are not an argument.", "low", ""),
    "suppressed-tech": (
        "hidden-technology",
        "high",
        "Working technology is hidden and replaced with a public substitute.",
        "high",
        "public-engineering",
    ),
    "telepathy": (
        "thought-readable",
        "low",
        "A decoder can already turn brain activity into text.",
        "low",
        "",
    ),
    "town-square": ("", "low", "These posts do not form one distinct argument.", "low", ""),
    "traffic": (
        "trafficking-trade",
        "low",
        "Trafficking is treated here as a trade with official cover.",
        "low",
        "sting-reporting",
    ),
    "transvestigation": (
        "gender-campaign",
        "high",
        "Institutions are running a gender campaign and miscounting its harm.",
        "high",
        "clinical-care",
    ),
    "unexplained": ("", "low", "These posts do not form one distinct argument.", "low", ""),
    "usury": (
        "debt-rule",
        "high",
        "Usury and centralized banking are how conquered places are held.",
        "high",
        "interest-ordinary",
    ),
    "vaccine-population-control": (
        "shot-depopulation",
        "high",
        "The shots are a stage in a stated plan to cut the population.",
        "high",
        "shots-protect",
    ),
    "war": (
        "managed-war",
        "low",
        "The Ukraine war is filed as a managed conflict, though much of the room is wire copy.",
        "low",
        "invasion-real",
    ),
    "zombies-vampires": (
        "occult-undead",
        "low",
        "Undead stories are read here as occult practice and lab work, not only fiction.",
        "low",
        "folklore-only",
    ),
}

HOLDING_ROOMS = frozenset(
    {
        "development",
        "off-topic",
        "podcasts",
        "songwalker",
        "ech-in-time",
        "planned-obsolescence",
        "pyramidal-empire",
        "forgotten-future",
    }
)

COMMUNISM_WORDS = (
    "china",
    "chinese",
    "soviet",
    "lenin",
    "stalin",
    "ccp",
    "communist",
    "marx",
    "ussr",
    "beijing",
    "mao",
    "shanghai",
)

COUNTER_CLAIM = {
    "speech-left-open": "The same closures are ordinary law or moderation.",
    "timeline-holds": "The textbook timeline still holds.",
    "party-delivered": "The party-state delivered what it claimed.",
    "genuine-dissent": "The dissent is genuine and unmanaged.",
    "standard-orbits": "The planets stay on the textbook orbits.",
    "no-bloodline": "There is no royal bloodline running the state.",
    "count-held": "The count was close and it held.",
    "weather-natural": "The weather in these posts is natural.",
    "mars-empty": "Mars has no human rulers.",
    "ordinary-sediment": "The deposits are ordinary sediment.",
    "bombs-fell": "The bombs fell as the public record says.",
    "no-reset": "There is no repeated reset.",
    "public-engineering": "The technology on offer is the technology that exists.",
    "interest-ordinary": "Interest is an ordinary price of credit.",
    "shots-protect": "The shots protect the people who take them.",
    "clinical-care": "The clinics are care, not a campaign.",
    "solid-crust": "The crust is solid and has no inner world.",
    "therapy-only": "These accounts are therapy, not a program.",
    "stories-entertain": "The stories are entertainment.",
    "tartary-myth": "Tartary is a myth layered on real empires.",
    "launches-real": "The launches flew.",
    "invasion-real": "The war is an invasion, not a managed script.",
    "sting-reporting": "The posts are sting reports, not proof of a trade.",
    "folklore-only": "The undead material is folklore.",
    "globe-measured": "The measured earth is a globe.",
    "experiment-hoax": "The Philadelphia story is nonsense.",
    "senses-only": "Machines may reach senses and muscles, not thoughts.",
    "health-natural": "Network radiation is ordinary and not a health campaign.",
    "towers-ordinary": "The towers are ordinary infrastructure.",
    "no-control-grid": "The network is connectivity, not a control grid.",
    "no-eugenics": "These harms are not a eugenics program.",
    "war-only": "These deaths are war, not a named genocide program.",
    "pest-control": "The chemicals are pest control, not a people poison.",
}

# Sub-axis keyword catalogs for pages that need immediate claim keys.
SUBAXES: dict[str, list[tuple[str, str, tuple[str, ...]]]] = {
    "5g": [
        (
            "health-harm",
            "5G and related RF are treated as a health harm, not only a network upgrade.",
            ("cancer", "radiation", "health", "sick", "tumor", "emf", "brain", "dna", "illness"),
        ),
        (
            "control-grid",
            "The rollout is framed as a control or surveillance grid.",
            ("control", "surveillance", "track", "grid", "military", "weapon", "smart city"),
        ),
        (
            "infra-rollout",
            "The posts argue about towers, antennas, and the infrastructure rollout itself.",
            ("tower", "antenna", "rollout", "mast", "fiber", "cell", "wireless", "bandwidth"),
        ),
    ],
    "genocide": [
        (
            "eugenics-harm",
            "Population harms are framed as eugenics or selective killing.",
            ("eugenic", "steril", "depopul", "cull", "breed", "genetic"),
        ),
        (
            "conquest-kill",
            "Conquest and mass killing are the standing frame for these harms.",
            ("genocide", "holocaust", "massacre", "exterminat", "ethnic", "ukraine", "gaza", "armen"),
        ),
        (
            "pesticide-poison",
            "Pesticides and industrial poisons are filed as people-harm agents.",
            ("pesticide", "glyphosate", "roundup", "poison", "chemtrail", "spray", "toxin"),
        ),
    ],
}

# Local axes general may open when words name a known thesis (not page-slug keys).
GENERAL_SPILL: list[tuple[str, str, tuple[str, ...]]] = [
    (
        "shot-depopulation",
        "The shots are a stage in a stated plan to cut the population.",
        ("vaccine", "vax", "mrna", "pfizer", "moderna", "jab", "shot ", "inject"),
    ),
    (
        "managed-war",
        "War is filed as a managed conflict.",
        ("ukraine", "russia", "nato", "invasion", "missile", "donbas"),
    ),
    (
        "speech-control",
        "Speech and reporting are being closed by platforms or states.",
        ("censor", "deplatform", "shadowban", "free speech", "encryption ban"),
    ),
    (
        "block-the-sun",
        "Programs are already dimming the sun and steering weather.",
        ("chemtrail", "geoengineer", "solar radiation", "stratospheric", "cloud seed"),
    ),
    (
        "debt-rule",
        "Usury and centralized banking hold conquered places.",
        ("usury", "federal reserve", "central bank", "debt slave", "interest rate"),
    ),
    (
        "flat-earth",
        "The useful map is treated as a flat azimuthal earth.",
        ("flat earth", "firmament", "globe lie"),
    ),
    (
        "great-reset",
        "Resets are repeated so the same class can reissue the world.",
        ("great reset", "agenda 2030", "build back", "world economic forum", "klaus"),
    ),
    (
        "hidden-technology",
        "Working technology is hidden and replaced with a public substitute.",
        ("free energy", "suppressed tech", "tesla", "overunity"),
    ),
    (
        "stolen-count",
        "Recent counts were interfered with and then protected in court.",
        ("election fraud", "stolen election", "ballot", "dominion", "2020 elect"),
    ),
]


def split_comment(text: str) -> tuple[dict[str, str], str]:
    lines = text.splitlines()
    headers: dict[str, str] = {}
    index = 0
    while index < len(lines) and lines[index].strip():
        if ":" not in lines[index]:
            break
        key, value = lines[index].split(":", 1)
        headers[key.strip()] = value.strip()
        index += 1
    if index < len(lines) and not lines[index].strip():
        index += 1
    return headers, "\n".join(lines[index:]).strip()


def is_wire_copy(body: str) -> bool:
    low = body.lower()
    if re.search(r"https?://", low) and len(body) < 280:
        return True
    if re.match(r"^(breaking|update|live|watch|source):", low):
        return True
    if body.count("http") >= 2 and len(body) < 500:
        return True
    # Headline-only paste: one short line, title case-ish, no first person.
    if "\n" not in body and len(body) < 160 and not re.search(r"\b(i|we|my|our)\b", low):
        if re.search(r"\b(says|said|reports|according to|reuters|ap news|bbc)\b", low):
            return True
    return False


def match_subaxes(page: str, body: str) -> tuple[str, str] | None:
    low = body.lower()
    for key, _summary, cues in SUBAXES.get(page, []):
        if any(cue in low for cue in cues):
            return key, "low"
    return None


def match_general_spill(body: str) -> tuple[str, str] | None:
    low = body.lower()
    for key, _summary, cues in GENERAL_SPILL:
        if any(cue in low for cue in cues):
            return key, "low"
    return None


def reject_page_slug(page: str, key: str) -> str:
    if key == page:
        return "other"
    return key


def assign_key(page: str, body: str) -> tuple[str, str]:
    """Return (key, confidence). Key is never empty and never the page slug."""
    if is_non_argument(body):
        return "other", "high"
    if page in HOLDING_ROOMS:
        return "other", "high" if page in {"development", "off-topic"} else "low"
    if page == "philadelphia-experiment":
        low = body.lower()
        if any(word in low for word in ("nonsense", "hoax", "didn't happen", "did not happen")):
            return "experiment-hoax", "high"
        return "ship-displaced", "high"
    if page == "telepathy":
        low = body.lower()
        if any(
            phrase in low
            for phrase in (
                "don't think they will ever",
                "do not think they will ever",
                "no such thing as reading",
                "don't think there is any such thing",
            )
        ):
            return "senses-only", "low"
        return "thought-readable", "low"
    if page == "maps":
        if "flat" in body.lower():
            return "flat-earth", "low"
        hit = match_subaxes(page, body)
        if hit:
            return hit
        return "other", "low"
    if page == "town-square":
        if "flat" in body.lower() and len(body.strip()) >= 24:
            return "flat-earth", "low"
        spill = match_general_spill(body)
        if spill:
            return spill
        return "other", "low"
    if page == "communism":
        low = body.lower()
        if any(word in low for word in COMMUNISM_WORDS):
            return "party-state", "high"
        return "other", "low"
    if page == "war":
        if is_wire_copy(body):
            return "other", "high"
        return "managed-war", "low"
    if page in SUBAXES:
        hit = match_subaxes(page, body)
        if hit:
            return hit
        # Claim-shaped remainder under agreement pages still needs an axis when possible.
        if page == "5g":
            return "infra-rollout", "low"
        if page == "genocide":
            return "conquest-kill", "low"
        return "other", "low"
    if page == "general":
        spill = match_general_spill(body)
        if spill:
            return spill
        return "other", "low"
    if page == "memes":
        spill = match_general_spill(body)
        if spill:
            return spill
        return "other", "low"
    primary, confidence, _summary, _sc, _counter = ROOMS[page]
    if not primary:
        return "other", confidence
    return reject_page_slug(page, primary), confidence


def position_for(page: str, key: str) -> tuple[str, str]:
    if key == "other":
        return "These posts are not an argument.\n", "low"
    if key == "uncategorized":
        return "These posts do not form one distinct argument.\n", "low"
    if key == "experiment-hoax":
        return "The Philadelphia story is nonsense.\n", "high"
    if key == "senses-only":
        return "Machines may reach senses and muscles. They do not read thoughts.\n", "low"
    if key == "flat-earth" and page != "maps":
        return "A post in this room says the earth is flat.\n", "low"
    for axis_key, summary, _cues in SUBAXES.get(page, []):
        if axis_key == key:
            return summary + "\n", "low"
    for axis_key, summary, _cues in GENERAL_SPILL:
        if axis_key == key:
            return summary + "\n", "low"
    primary, _fc, summary, summary_confidence, _counter = ROOMS[page]
    if key == primary or not primary:
        return summary + "\n", summary_confidence
    return summary + "\n", summary_confidence


def counter_for(page: str, key: str) -> str:
    if key in {"other", "uncategorized"}:
        return ""
    if key == "experiment-hoax":
        return "ship-displaced"
    if key == "senses-only":
        return "thought-readable"
    if key == "flat-earth":
        return "globe-measured"
    if key == "health-harm":
        return "health-natural"
    if key == "infra-rollout":
        return "towers-ordinary"
    if key == "control-grid":
        return "no-control-grid"
    if key == "eugenics-harm":
        return "no-eugenics"
    if key == "conquest-kill":
        return "war-only"
    if key == "pesticide-poison":
        return "pest-control"
    for axis_key, _summary, _cues in GENERAL_SPILL:
        if axis_key == key:
            # reuse room counter when the spill mirrors a room
            for room, spec in ROOMS.items():
                if spec[0] == key:
                    return spec[4]
    primary, _fc, _summary, _sc, counter = ROOMS[page]
    if key == primary:
        return counter
    return ""


def suggestion_text(counter: str, written: set[str]) -> str:
    if not counter:
        return "# Suggested counter\n\nNo unwritten counter is named for this key.\n"
    claim = COUNTER_CLAIM.get(counter, counter)
    if counter in written:
        return (
            "# Suggested counter\n\n"
            f"Opposing one-liner: {counter}\n\n"
            "Someone has already written this opposing key.\n\n"
            f"{claim}\n"
        )
    return (
        "# Suggested counter\n\n"
        f"Opposing one-liner: {counter}\n\n"
        "Nobody wrote this counter. It is not a directory.\n\n"
        f"{claim}\n"
    )


def questions_text(key: str, confidence: str) -> str:
    if confidence == "high":
        return "# Questions\n\n- What fact would show this reading is wrong?\n"
    return (
        "# Questions\n\n"
        f"- This `{key}` reading is low confidence. What fact would show it is wrong?\n"
        "- Should a later batch leave the posts here, or move them once someone answers?\n"
    )


def load_page_comments(page_dir: Path, page: str) -> list[dict]:
    topic_dir = page_dir / "topics" / page
    comments: list[dict] = []
    if not topic_dir.exists():
        return comments
    for key_dir in sorted(topic_dir.iterdir()):
        if not key_dir.is_dir():
            continue
        comments_dir = key_dir / "comments"
        if not comments_dir.exists():
            continue
        for path in comments_dir.glob("*.md"):
            headers, body = split_comment(path.read_text(encoding="utf-8", errors="replace"))
            comments.append(
                {
                    "id": path.stem,
                    "author": headers.get("author", "0"),
                    "source": headers.get("source", ""),
                    "starting": headers.get("starting", ""),
                    "body": body or "(no text)",
                    "old_key": key_dir.name,
                }
            )
    comments.sort(key=lambda item: (int(item["id"]) if item["id"].isdigit() else 0, item["id"]))
    return comments


def write_page(page: str, comments: list[dict]) -> dict:
    page_dir = REPO / "pages" / page
    topic = page
    topic_dir = page_dir / "topics" / topic
    if topic_dir.exists():
        shutil.rmtree(topic_dir)
    topic_dir.mkdir(parents=True, exist_ok=True)

    buckets: dict[str, list[dict]] = defaultdict(list)
    decisions = []
    for comment in comments:
        key, confidence = assign_key(page, comment["body"])
        key = reject_page_slug(page, key)
        comment["key"] = key
        comment["confidence"] = confidence
        buckets[key].append(comment)
        decisions.append(
            {
                "comment": comment["id"],
                "confidence": confidence,
                "keys": [key],
                "kind": "file",
                "rule": RULE,
                "starting": comment.get("starting") or "",
            }
        )

    written = set(buckets)
    primary, _fc, _summary, summary_confidence, counter = ROOMS[page]
    for key in sorted(written):
        _pos, key_conf = position_for(page, key)
        decisions.append({"confidence": key_conf, "key": key, "kind": "summary", "rule": RULE})
    if counter and counter not in written:
        decisions.append(
            {
                "confidence": summary_confidence,
                "created": False,
                "key": counter,
                "kind": "suggestion",
                "rule": RULE,
            }
        )
    decisions.sort(key=lambda item: (item.get("kind", ""), item.get("key", ""), item.get("comment", "")))

    for key, bucket in buckets.items():
        base = topic_dir / key
        (base / "comments").mkdir(parents=True, exist_ok=True)
        position, key_conf = position_for(page, key)
        (base / "position.md").write_text(position, encoding="utf-8")
        (base / "questions.md").write_text(questions_text(key, key_conf), encoding="utf-8")
        (base / "suggested-counter.md").write_text(
            suggestion_text(counter_for(page, key), written), encoding="utf-8"
        )
        (base / "votes.json").write_text('{\n  "ids": []\n}\n', encoding="utf-8")
        authors = sorted({int(item["author"]) for item in bucket if str(item["author"]).isdigit()})
        (base / "subscribers.json").write_text(
            json.dumps({"ids": authors}, indent=2) + "\n", encoding="utf-8"
        )
        (base / "comment-votes.json").write_text("{}\n", encoding="utf-8")
        for comment in bucket:
            header = f"author: {comment['author']}\n"
            if comment.get("source"):
                header += f"source: {comment['source']}\n"
            if comment.get("starting"):
                header += f"starting: {comment['starting']}\n"
            (base / "comments" / f"{comment['id']}.md").write_text(
                f"{header}\n{comment['body'].strip()}\n", encoding="utf-8"
            )

    pairs = []
    if "experiment-hoax" in written and "ship-displaced" in written:
        pairs.append(["experiment-hoax", "ship-displaced"])
    if "senses-only" in written and "thought-readable" in written:
        pairs.append(["senses-only", "thought-readable"])
    read = " ".join(f"{a} is paired with {b}." for a, b in pairs)
    (topic_dir / "pairs.json").write_text(
        json.dumps(
            {
                "confidence": "high" if pairs else summary_confidence,
                "links": [],
                "pairs": pairs,
                "read": read,
                "rule": RULE,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (topic_dir / "key-history.json").write_text("{}\n", encoding="utf-8")
    (topic_dir / "votes.json").write_text('{\n  "ids": []\n}\n', encoding="utf-8")

    page_index = {
        "old_keys": {},
        "pointers": {},
        "topics": {
            topic: {
                "decisions": decisions,
                "history": {},
                "subtopics": sorted(written),
            }
        },
    }
    (page_dir / "index.json").write_text(json.dumps(page_index, indent=2) + "\n", encoding="utf-8")
    (page_dir / "job.json").write_text(
        json.dumps({"status": "done", "topics": [topic]}, indent=2) + "\n", encoding="utf-8"
    )
    (page_dir / "notifications.json").write_text('{\n  "events": []\n}\n', encoding="utf-8")

    # Page questions only for new low-confidence leftovers not covered by rules.md.
    lines = ["# Questions", ""]
    counts = {key: len(bucket) for key, bucket in buckets.items()}
    asked = False
    if primary and summary_confidence == "low" and primary in counts:
        lines.append(
            f"- {counts[primary]} posts are under `{primary}` at low confidence. "
            f"Is the standing summary still right?"
        )
        asked = True
    if page == "5g" and any(k in written for k in ("health-harm", "control-grid", "infra-rollout")):
        lines.append(
            "- `5g` now has claim-shaped sub-axes. Should any of these be renamed or merged?"
        )
        asked = True
    if page == "genocide" and any(
        k in written for k in ("eugenics-harm", "conquest-kill", "pesticide-poison")
    ):
        lines.append(
            "- `genocide` was split into claim-shaped sub-axes. Is that split right?"
        )
        asked = True
    if page == "general" and any(k not in {"other"} for k in written):
        lines.append(
            "- `general` minted local spill axes from keywords. Should any of those posts "
            "instead move onto their topic pages?"
        )
        asked = True
    if asked:
        (page_dir / "questions.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    elif (page_dir / "questions.md").exists():
        (page_dir / "questions.md").unlink()

    return {
        "page": page,
        "n": len(comments),
        "keys": {key: len(bucket) for key, bucket in sorted(buckets.items())},
        "asked": asked,
    }


def main() -> None:
    if not (REPO / "rules.md").exists():
        raise SystemExit("rules.md missing on comments repo")
    pages = sorted(
        p.name
        for p in (REPO / "pages").iterdir()
        if p.is_dir() and p.name not in SKIP_PAGES
    )
    missing = [name for name in pages if name not in ROOMS]
    if missing:
        raise SystemExit(f"ROOMS missing pages: {missing}")
    report = []
    for page in pages:
        comments = load_page_comments(REPO / "pages" / page, page)
        if not comments:
            print(f"skip empty {page}")
            continue
        row = write_page(page, comments)
        report.append(row)
        keys = ", ".join(f"{k}:{v}" for k, v in row["keys"].items())
        print(f"{page:28} n={row['n']:4}  {keys}")
    (REPO / "gauge" / "refile-report.json").write_text(
        json.dumps({"pages": report}, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {len(report)} pages")


if __name__ == "__main__":
    main()
