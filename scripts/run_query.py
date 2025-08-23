#!/usr/bin/env python3
import json
import os
import random
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
import hashlib

# -------------------------
# Config (env-overridable)
# -------------------------
MODEL = os.environ.get("OLLAMA_MODEL", "mistral")  # e.g. mistral, llama3, phi3, qwen, etc.
MAX_TOKENS = int(os.environ.get("OLLAMA_MAX_TOKENS", "0"))  # 0 lets model default
TEMPERATURE = os.environ.get("OLLAMA_TEMPERATURE", "0.2")
OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", "outputs"))
STATE_DIR = Path(os.environ.get("STATE_DIR", "state"))
STATE_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
INDEX_PATH = STATE_DIR / "last_index.txt"

# -------------------------
# Topic Space (Python 3.12+)
# -------------------------
# We build a very large *implicit* topic space via combinatorics without storing it all at once.
# The generator maps an integer index -> a deterministic topic string.

CORE_CONCEPTS = [
    "pattern matching (match/case)",
    "structural pattern matching guards",
    "f-strings formalization (PEP 701)",
    "type parameter syntax (PEP 695)",
    "buffer protocol (PEP 688)",
    "exception groups (PEP 654)",
    "typing.Annotated and metadata",
    "typing.Self and TypeVarTuple",
    "dataclasses and slots",
    "frozen dataclasses and immutability",
    "context managers and contextlib",
    "async context managers and AsyncExitStack",
    "iterators, generators, and yield from",
    "coroutines and async/await",
    "concurrency vs parallelism",
    "subinterpreters in CPython",
    "__slots__ memory optimization",
    "descriptor protocol and properties",
    "metaclasses and class creation",
    "ABC and Protocol (structural typing)",
    "error handling and tracebacks",
    "pathlib vs os.path",
    "datetime and timezone correctness",
    "decimal vs float precision",
    "copy vs deepcopy semantics",
]

# Pull stdlib module names from the running interpreter where available.
try:
    import sys as _sys
    STDLIB_MODULES = sorted(getattr(_sys, "stdlib_module_names", set()))
except Exception:
    STDLIB_MODULES = []

# Curated popular third‑party libs frequently used with Python 3.12+
THIRDPARTY = [
    "fastapi", "pydantic", "sqlalchemy", "alembic", "psycopg", "httpx",
    "requests", "uvicorn", "gunicorn", "pytest", "hypothesis", "mypy",
    "pyright", "ruff", "black", "isort", "poetry", "pip-tools", "pipx",
    "numpy", "pandas", "polars", "pyarrow", "xarray", "matplotlib", "plotly",
    "scikit-learn", "lightgbm", "xgboost", "mlflow", "ray", "dask",
    "celery", "redis", "kombu", "aiohttp", "trio", "anyio", "typer",
    "click", "rich", "loguru", "tenacity", "orjson", "uvloop", "asyncpg",
    "motor", "pymongo", "boto3", "azure-identity", "google-cloud-storage",
]

ACTIONS = [
    "design", "implement", "refactor", "optimize", "benchmark", "profile",
    "unit test", "property test", "type-check", "document", "package",
    "containerize", "deploy", "secure", "harden", "observe",
]

DOMAINS = [
    "CLI tools", "REST APIs", "web backends", "data pipelines", "ETL jobs",
    "stream processing", "microservices", "batch jobs", "ML training loops",
    "notebooks to production", "event-driven systems", "cron-driven tasks",
    "serverless handlers", "WASM targets", "edge runtimes",
]

ADV_TOPICS = [
    "zero-copy buffers", "memoryview techniques", "Cython vs CFFI vs ctypes",
    "multiprocessing vs asyncio for I/O", "threadpools and GIL behavior",
    "structured logging", "backpressure in async code", "cancellation safety",
    "retry policies and idempotency", "schema validation",
    "ORM performance patterns", "vectorized computing", "columnar data (Arrow)",
    "time-series indexing", "TZ-aware datetimes", "parsing and lexing",
]

TEMPLATES = [
    "How to {action} {domain} using {lib} with Python 3.12+",
    "Deep dive: {concept} with {lib} in Python 3.12+",
    "Best practices to {action} {lib} for {domain} (Python 3.12+)",
    "{concept} — pitfalls and patterns in {domain} (Python 3.12+)",
    "Performance guide: {adv} with {lib} on Python 3.12+",
]

# Mixed‑radix mapping of a single integer -> a tuple of indices into the arrays above
SPACE = [ACTIONS, DOMAINS, CORE_CONCEPTS, THIRDPARTY, ADV_TOPICS, TEMPLATES]
RADIX = [len(ACTIONS), len(DOMAINS), len(CORE_CONCEPTS), len(THIRDPARTY), len(ADV_TOPICS), len(TEMPLATES)]
TOTAL_SPACE = 1
for r in RADIX:
    TOTAL_SPACE *= r

# Expand with stdlib-only templates for even more coverage without exploding memory
STDLIB_TEMPLATES = [
    "Deep dive: {module} standard library module in Python 3.12+",
    "{module}: common mistakes, gotchas, and best practices (Python 3.12+)",
    "How to combine {module} with typing for production code (Python 3.12+)",
    "Testing strategies for {module} code with pytest (Python 3.12+)",
]
TOTAL_STDLIB = len(STDLIB_MODULES) * len(STDLIB_TEMPLATES) if STDLIB_MODULES else 0


def index_to_topic(idx: int) -> str:
    """Map an integer to a deterministic topic string spanning huge space."""
    # Interleave between combo-space and stdlib-space to diversify
    # Even idx -> combo; odd idx -> stdlib (if available), fallback to combo
    if (idx % 2 == 1) and TOTAL_STDLIB:
        sidx = (idx // 2) % TOTAL_STDLIB
        mod_idx = sidx % len(STDLIB_MODULES)
        tmpl_idx = (sidx // len(STDLIB_MODULES)) % len(STDLIB_TEMPLATES)
        module = STDLIB_MODULES[mod_idx]
        tmpl = STDLIB_TEMPLATES[tmpl_idx]
        return tmpl.format(module=module)

    # combo space
    cidx = (idx // 2) % TOTAL_SPACE if TOTAL_STDLIB else idx % TOTAL_SPACE
    a = cidx % RADIX[0]
    cidx //= RADIX[0]
    d = cidx % RADIX[1]
    cidx //= RADIX[1]
    c = cidx % RADIX[2]
    cidx //= RADIX[2]
    l = cidx % RADIX[3]
    cidx //= RADIX[3]
    adv = cidx % RADIX[4]
    cidx //= RADIX[4]
    t = cidx % RADIX[5]

    data = {
        "action": ACTIONS[a],
        "domain": DOMAINS[d],
        "concept": CORE_CONCEPTS[c],
        "lib": THIRDPARTY[l],
        "adv": ADV_TOPICS[adv],
    }
    template = TEMPLATES[t]
    return template.format(**data)


# -------------------------
# Persistent index helpers
# -------------------------

def read_index() -> int:
    if INDEX_PATH.exists():
        try:
            return int(INDEX_PATH.read_text().strip())
        except Exception:
            return 0
    return 0


def write_index(i: int) -> None:
    INDEX_PATH.write_text(str(i))


# -------------------------
# Ollama invocation
# -------------------------

def call_ollama(prompt: str) -> str:
    # Compose full prompt to nudge JSON output
    system_instructions = (
        "You are a meticulous Python 3.12+ expert. "
        "Return a concise but thorough JSON object with keys: "
        "title, summary, key_points (list), code_examples (list of objects with language and code), "
        "version_notes (list), caveats (list). Use only valid JSON."
    )
    full_prompt = f"{system_instructions}\n\nTOPIC:\n{prompt}"

    cmd = ["ollama", "run", MODEL]
    env = os.environ.copy()
    env["OLLAMA_NUM_CTX"] = env.get("OLLAMA_NUM_CTX", "4096")
    if MAX_TOKENS:
        env["OLLAMA_NUM_PREDICT"] = str(MAX_TOKENS)
    env["OLLAMA_TEMPERATURE"] = str(TEMPERATURE)

    proc = subprocess.run(
        cmd,
        input=full_prompt,
        text=True,
        capture_output=True,
        env=env,
        check=False,
    )

    stdout = proc.stdout.strip()
    stderr = proc.stderr.strip()
    if proc.returncode != 0:
        raise RuntimeError(f"ollama failed: {proc.returncode}\n{stderr}\n{stdout}")
    return stdout


# -------------------------
# JSON robustness
# -------------------------

def try_parse_json(s: str):
    # Try whole string, then first JSON object via a lax extractor
    try:
        return json.loads(s)
    except Exception:
        pass
    # Find first \{...\} block
    m = re.search(r"\{[\s\S]*\}", s)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            return None
    return None


# -------------------------
# Main
# -------------------------

def main():
    idx = read_index()
    topic = index_to_topic(idx)

    # Prepare metadata
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    prompt = f"Write a Python 3.12+ focused, accurate explainer for: {topic}"

    try:
        raw = call_ollama(prompt)
    except Exception as e:
        raw = f"ERROR calling ollama: {e}"

    parsed = try_parse_json(raw)

    record = {
        "timestamp_utc": ts,
        "model": MODEL,
        "topic_index": idx,
        "topic": topic,
        "prompt": prompt,
        "response_raw": raw,
        "response_parsed": parsed,
    }

    # Stable filename from topic index + short hash of topic text
    short = hashlib.sha256(topic.encode("utf-8")).hexdigest()[:10]
    fname = f"{ts.replace(':','').replace('-','')}__{idx:012d}_{short}.json"
    out_path = OUTPUT_DIR / fname
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(record, f, indent=2, ensure_ascii=False)

    print(f"Saved {out_path}")

    # advance pointer and persist
    write_index(idx + 1)


if __name__ == "__main__":
    main()
