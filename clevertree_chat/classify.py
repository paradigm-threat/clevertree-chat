"""Choose the shortest distinct one-liner. Do not merge a different axis into it."""

from __future__ import annotations

import re
from collections import defaultdict

from clevertree_chat.keys import assert_short_key, slugify
from clevertree_chat.rules import Rules

LEGALITY = frozenset({"illegal", "legal"})
HOLDING_KEY = "uncategorized"
OTHER_KEY = "other"

_STOP = frozenset(
    """
    a an the these those this that they them their it its are is was were be
    been being am we you i need needed for and or now of to in on at by with
    from as so how what when where who why just very really also because our
    your people should would could can will about into than then there here
    have has had do does did not no yes if but too more most some any all each
    other who whom
    """.split()
)

# Citations are recorded strings. Phase 1 does not fetch them.
_FLOCK = {
    "invasion-of-privacy": {
        "cues": (
            r"mass surveillance",
            r"invasion of privacy",
            r"\bprivacy\b",
            r"\bsurveillance\b",
        ),
        "pair": "national-security",
        "synonyms": (
            "mass-surveillance",
            "surveillance",
            "privacy",
            "privacy-invasion",
        ),
        "position": "These cameras are mass surveillance and an invasion of privacy.",
        "opposing": "The opposing claim is that the cameras are needed now for national security.",
        "citation": "https://www.cisa.gov/topics/physical-security",
        "questions": (
            "Who is watched, and where does the watching stop?",
            "What fact would show this is not mass surveillance?",
        ),
    },
    "national-security": {
        "cues": (
            r"national security",
            r"\bborders?\b",
            r"\belections?\b",
            r"\bcrime\b",
            r"needed now",
            r"public safety",
        ),
        "pair": "invasion-of-privacy",
        "synonyms": (
            "security",
            "public-safety",
            "borders",
            "elections",
            "crime",
            "border-security",
            "election-security",
        ),
        "position": (
            "These cameras are needed now for national security, "
            "including borders, elections, and crime."
        ),
        "opposing": "The opposing claim is that the cameras are mass surveillance.",
        "citation": "https://www.eff.org/pages/automated-license-plate-readers-alpr",
        "questions": (
            "Which threat are the cameras supposed to meet?",
            "What limit would still leave that protection in place?",
        ),
    },
    "illegal": {
        "cues": (),
        "pair": "legal",
        "synonyms": (),
        "position": "These cameras are illegal.",
        "opposing": (
            "No post here yet answers the accusation of being illegal. "
            "A cited counter is the Patriot Act."
        ),
        "citation": "https://www.congress.gov/bill/107th-congress/house-bill/3162",
        "questions": (
            "Which rule is supposed to forbid this?",
            "Who would enforce that rule?",
        ),
    },
    "legal": {
        "cues": (),
        "pair": "illegal",
        "synonyms": (),
        "position": "These cameras are legal.",
        "opposing": "The opposing claim is that the cameras are illegal.",
        "citation": "https://www.law.cornell.edu/wex/illegality",
        "questions": (
            "Which authority is supposed to allow this?",
            "What would put it outside that authority?",
        ),
    },
}

_LIBRARY = {
    "access-barrier": {
        "cues": (
            r"\bpunish",
            r"cannot pay",
            r"can't pay",
            r"cannot afford",
            r"\bpoor\b",
            r"\bbarrier\b",
            r"keep people from",
            r"keep them from",
        ),
        "pair": "returns-books",
        "synonyms": ("punishes-poverty", "poverty", "unfair-fines"),
        "position": "Library fines are a barrier for people who cannot pay.",
        "opposing": "The opposing claim is that fines bring books back.",
        "citation": "https://www.ala.org/advocacy/fines",
        "questions": (
            "Who is kept from borrowing, and what do they lose?",
            "What would replace the fine for those readers?",
        ),
    },
    "returns-books": {
        "cues": (
            r"books back",
            r"book back",
            r"bring books",
            r"gets the book",
            r"get the book",
            r"gets books",
            r"\breturn",
            r"\bremind",
            r"\bforget",
        ),
        "pair": "access-barrier",
        "synonyms": ("children-forget", "forgetfulness", "late-returns", "overdue"),
        "position": "Library fines bring books back.",
        "opposing": "The opposing claim is that fines block people who cannot pay.",
        "citation": "https://www.ala.org/advocacy/access",
        "questions": (
            "What share of books come back because of the fine?",
            "What happens to a reader who cannot pay and still has the book?",
        ),
    },
    "illegal": {
        "cues": (),
        "pair": "legal",
        "synonyms": (),
        "position": "These fines are illegal.",
        "opposing": "The opposing claim is that the fines are legal.",
        "citation": "https://www.law.cornell.edu/wex/legality",
        "questions": (
            "Which rule is supposed to forbid the fine?",
            "Who would enforce that rule?",
        ),
    },
    "legal": {
        "cues": (),
        "pair": "illegal",
        "synonyms": (),
        "position": "These fines are legal.",
        "opposing": "The opposing claim is that the fines are illegal.",
        "citation": "https://www.law.cornell.edu/wex/illegality",
        "questions": (
            "Which authority is supposed to allow the fine?",
            "What would put the fine outside that authority?",
        ),
    },
}

TOPICS: dict[str, dict] = {
    "flock-cameras": _FLOCK,
    "library-fines": _LIBRARY,
}

SWEARS = ("shit", "fuck", "fucking", "damn", "asshole", "bitch", "crap", "bastard")
_SCOLD = ("disgusting", "unacceptable", "shame on", "how dare", "you should not", "condemn")


def synonym_target(topic: str, key: str) -> str | None:
    catalog = TOPICS.get(topic, {})
    if key in catalog:
        return key
    for canon, info in catalog.items():
        if key in info.get("synonyms", ()):
            return canon
    return None


def rename_allowed(topic: str, src: str, dst: str, rules: Rules) -> bool:
    """Same-argument renames only. Legality never folds into another axis."""
    if not rules.allows_rename():
        return False
    if src == dst:
        return False
    if (src in LEGALITY) != (dst in LEGALITY):
        return False
    return synonym_target(topic, src) == dst


def legality_key(text: str) -> str | None:
    low = text.lower()
    if re.search(r"\bnot illegal\b", low):
        return "legal"
    direct_illegal = re.search(
        r"\b(is|are|be|being|stays|stay)\s+illegal\b"
        r"|\b(is|are)\s+unlawful\b"
        r"|\bagainst the law\b"
        r"|\bbreaks the law\b"
        r"|\bthey are illegal\b"
        r"|\bthey're illegal\b"
        r"|\bit's illegal\b"
        r"|\billegal\b"
        r"|\bunlawful\b",
        low,
    )
    direct_legal = re.search(
        r"\b(is|are|be|being|stays|stay)\s+legal\b"
        r"|\b(is|are)\s+lawful\b"
        r"|\bwithin the law\b"
        r"|\bthey are legal\b"
        r"|\bthey're legal\b"
        r"|\blegal\b"
        r"|\blawful\b",
        low,
    )
    if direct_illegal and not direct_legal:
        return "illegal"
    if direct_legal and not direct_illegal:
        return "legal"
    if direct_illegal and direct_legal:
        if low.rfind("illegal") > low.rfind(" legal"):
            return "illegal"
        return "legal"
    return None


def legality_conflicted(text: str) -> bool:
    """Both legality words are present. `not illegal` is a clear reading of legal."""
    low = (text or "").lower()
    if re.search(r"\bnot illegal\b", low):
        return False
    illegal = re.search(r"\billegal\b|\bunlawful\b|\bagainst the law\b", low)
    legal = re.search(r"\blegal\b|\blawful\b|\bwithin the law\b", low)
    return bool(illegal and legal)


def reading_confidence(text: str) -> str:
    """How sure the axis reading is. Low does not pick a different key."""
    if legality_conflicted(text):
        return "low"
    return "high"


def _score_catalog(topic: str, text: str) -> str | None:
    catalog = TOPICS.get(topic)
    if not catalog:
        return None
    scores: dict[str, int] = {}
    for key, info in catalog.items():
        if key in LEGALITY:
            continue
        score = 0
        for cue in info.get("cues", ()):
            if re.search(cue, text, re.IGNORECASE):
                score += 1
        scores[key] = score
    best = max(scores.values(), default=0)
    if best <= 0:
        return None
    winners = [key for key, score in scores.items() if score == best]
    winners.sort(key=lambda key: (-len(key), key))
    return winners[0]


def mint_key(text: str) -> str:
    words = re.findall(r"[a-z0-9]+", text.lower())
    content = [word for word in words if word not in _STOP and len(word) > 2]
    if not content:
        content = ["point"]
    slug = "-".join(content[:3])
    return assert_short_key(slug)


def classify(topic: str, text: str) -> str:
    """A reading of the post. The live path does not file under this by itself."""
    topic_key = assert_short_key(slugify(topic))
    legal = legality_key(text)
    if legal:
        return legal
    found = _score_catalog(topic_key, text)
    if found:
        return assert_short_key(found)
    return mint_key(text)


def is_question(text: str) -> bool:
    return "?" in (text or "")


def named_axes(topic: str, text: str) -> list[str]:
    """Every axis the words actually name. Not the opposing key they do not state."""
    topic_key = assert_short_key(slugify(topic))
    raw = text or ""
    low = raw.lower()
    found: list[str] = []
    legal = legality_key(raw)
    if legal is None and re.search(r"\billegal\b", low):
        legal = "illegal"
    elif legal is None and re.search(r"\blegal\b", low):
        legal = "legal"
    if legal:
        found.append(legal)
    catalog = TOPICS.get(topic_key, {})
    for key, info in catalog.items():
        if key in LEGALITY:
            continue
        if any(re.search(cue, raw, re.IGNORECASE) for cue in info.get("cues", ())):
            found.append(key)
    unique: list[str] = []
    for key in found:
        if key not in unique:
            unique.append(key)
    return unique


def _fits_existing(topic: str, key: str, existing: set[str]) -> bool:
    if key in existing:
        return True
    for name in existing:
        if synonym_target(topic, name) == key:
            return True
    return False


def assign_keys(topic: str, text: str, existing: set[str], rules: Rules) -> list[str]:
    """One post, the keys it belongs to. Empty of a real key means none.

    Attach it to existing keys it already fits. Do not mint another key to
    catch a leftover sentence. A new key appears only when the post fits
    nothing that exists: that is the spill. A question is kept, and it joins
    the axis it names. The Patriot Act is not a key from this pass.
    """
    named = [key for key in named_axes(topic, text) if key != "patriot-act"]
    fitting = [key for key in named if _fits_existing(topic, key, existing)]
    if fitting:
        return fitting
    if not named:
        return [HOLDING_KEY]
    if is_question(text) and not rules.questions_allowed:
        return [OTHER_KEY]
    if rules.allows_new_key():
        return named
    return [OTHER_KEY]


PATRIOT_ACT = {
    "key": "patriot-act",
    "citation": "https://www.congress.gov/bill/107th-congress/house-bill/3162",
}


def unwritten_counter(bodies: list[str]) -> dict | None:
    """A cited counter nobody has written. It does not become a directory."""
    for body in bodies:
        if re.search(r"\bpatriot act\b", body, re.IGNORECASE):
            return dict(PATRIOT_ACT)
    return None


def batch_destination(topic: str, text: str) -> str:
    """The first axis a post names, or `other` when it names none.

    The batch uses assign_keys, which can list more than one existing key.
    This single reading does not file the post.
    """
    named = named_axes(topic, text)
    if named:
        return named[0]
    return OTHER_KEY


def spec(topic: str, key: str) -> dict | None:
    return TOPICS.get(topic, {}).get(key)


def summary_confidence(topic: str, key: str) -> str:
    """A catalog one-liner is a settled summary. A holding folder is not."""
    if spec(topic, key):
        return "high"
    return "low"


def regroup(topic: str, folder: str, comments: list, rules: Rules) -> dict[str, list]:
    """File each post by what it says. A hand-placed post may move.

    Frozen rules keep an already filed key where it is. The holding folder
    is not a key, so those posts are still filed on this pass.
    """
    if folder != HOLDING_KEY and rules.keys == "never":
        return {folder: list(comments)}
    grouped: dict[str, list] = defaultdict(list)
    for comment in comments:
        grouped[batch_destination(topic, comment.body)].append(comment)
    return {key: list(items) for key, items in grouped.items()}


def strip_swears(text: str) -> str:
    cleaned = text
    for word in SWEARS:
        cleaned = re.sub(rf"\b{re.escape(word)}\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r" +([.,])", r"\1", cleaned)
    return cleaned.strip()


def find_swears(bodies: list[str]) -> list[str]:
    found = []
    blob = " ".join(bodies).lower()
    for word in SWEARS:
        if re.search(rf"\b{re.escape(word)}\b", blob):
            found.append(word)
    return found


def dangerous_clauses(bodies: list[str]) -> list[str]:
    clauses = []
    pattern = re.compile(
        r"\b(beaten|beating|kill|killed|murder|round them up|violence against)\b",
        re.IGNORECASE,
    )
    for body in bodies:
        parts = re.split(r"(?<=[.!?])\s+", body.strip())
        for part in parts:
            if pattern.search(part):
                clauses.append(part.strip())
    return clauses


def build_position(
    topic: str,
    key: str,
    bodies: list[str],
    rules: Rules,
    existing_keys: set[str],
) -> str:
    info = spec(topic, key)
    if info:
        prose = info["position"]
    else:
        sample = strip_swears(bodies[0]) if bodies else key.replace("-", " ")
        prose = f"The argument is that {sample.rstrip('.')}."
    for clause in dangerous_clauses(bodies):
        shown = clause if rules.ai_may_swear else strip_swears(clause)
        prose += f" A posted claim says: {shown}"
    swears = find_swears(bodies)
    if swears and rules.ai_may_swear:
        prose += f" The posts use the word {swears[0]}."
    if not rules.ai_may_swear:
        prose = strip_swears(prose)
    partner = info["pair"] if info else None
    if partner and partner in existing_keys:
        prose += f" Paired counterpoint: {partner}."
    elif partner:
        prose += f" Suggested counterpoint, not yet a section: {partner}."
    lowered = prose.lower()
    for phrase in _SCOLD:
        if phrase in lowered:
            prose = re.sub(re.escape(phrase), "", prose, flags=re.IGNORECASE)
    if rules.summary_prefix:
        prefix = rules.summary_prefix.strip()
        if not prose.startswith(prefix):
            prose = f"{prefix} {prose}"
    return prose.strip() + "\n"


def build_questions(topic: str, key: str) -> str:
    info = spec(topic, key)
    questions = info["questions"] if info else (
        "What would change this claim?",
        "What is the strongest version of the other side?",
    )
    lines = ["# Questions", ""]
    lines.extend(f"- {question}" for question in questions)
    return "\n".join(lines) + "\n"


def build_suggestion(topic: str, key: str, existing_keys: set[str]) -> str:
    info = spec(topic, key)
    partner = info["pair"] if info else None
    if not partner:
        partner = "opposing-line"
        opposing = "An opposing one-liner can be opened when someone writes it."
        citation = "https://example.com/phase-1-citation-not-fetched"
    else:
        opposing = info["opposing"]
        citation = info["citation"]
    if partner in existing_keys:
        state = "Someone has already written the first words of this opposing key."
    else:
        state = (
            "This opposing key is not a directory until a person writes "
            "the first words there."
        )
    return (
        "# Suggested counter\n\n"
        f"Opposing one-liner: {partner}\n\n"
        f"{state}\n\n"
        f"{opposing}\n\n"
        f"Citation: {citation}\n\n"
        "The citation is recorded. Phase 1 does not fetch the page.\n"
    )


def readable_pairs(pairs: list[tuple[str, str]], links: list[tuple[str, str]]) -> str:
    bits = [f"{left} is paired with {right}" for left, right in pairs]
    if links:
        bits.append("Cross-links are links, not merges")
    if not bits:
        return "No pairs yet. A suggested counter is not a directory."
    return ". ".join(bits) + "."
