MAX_CLARIFY_CHOICES = 4


def flatten_choice(c: object) -> str:
    if c is None:
        return ""
    if isinstance(c, str):
        return c.strip()
    if isinstance(c, dict):
        for key in ("label", "description", "text", "title"):
            v = c.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()
        return ""
    if isinstance(c, (list, tuple)):
        return " ".join(flatten_choice(x) for x in c).strip()
    return str(c).strip()


def normalize_clarify_choices(choices: object | None) -> list[str] | None:
    if choices is None:
        return None
    if not isinstance(choices, list):
        raise ValueError("choices must be a list of strings")
    cleaned = [s for s in (flatten_choice(c) for c in choices) if s][:MAX_CLARIFY_CHOICES]
    return cleaned or None
