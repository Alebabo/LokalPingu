"""Train LokalPingu's tiny offline multi-label tourism intent model.

The source brief names MASSIVE as a useful intent dataset, but does not bundle
training records. This script therefore creates a clearly labelled synthetic
dataset, trains a linear bag-of-words model, evaluates it on separately written
phrases, and exports weights for the browser runtime.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import re
from collections import Counter
from pathlib import Path

import torch


SEED = 20261004
LABELS = [
    "price",
    "location",
    "checkin",
    "capacity",
    "dietary",
    "cancellation",
    "availability",
    "payment",
    "transport",
    "weather",
    "suitability",
]

TRAIN_PHRASES = {
    "price": [
        "how much is {offer}", "what does {offer} cost", "send me your rates",
        "what is the fee for {count} guests", "please share the price", "is {offer} expensive",
        "quote {offer} for {count}", "how much should we budget", "what do you charge",
    ],
    "location": [
        "where are you located", "what is your address", "how do I find the farm",
        "send the location", "are you near the market", "please give me directions",
        "drop a map pin", "help our driver locate you", "where do we meet",
    ],
    "checkin": [
        "what time can we arrive", "when does check in start", "can we arrive early",
        "what is the arrival time", "is late check in possible", "when should we come",
        "what is the earliest we may show up", "how early can we get there", "latest arrival time",
    ],
    "capacity": [
        "can you host {count} people", "what is the maximum group size", "is there room for {count}",
        "how many guests can join", "do you accept large groups", "our party has {count} adults",
        "will a party of {count} fit", "is there capacity for {count}", "can everyone fit",
    ],
    "dietary": [
        "one guest has a peanut allergy", "do you have vegetarian food", "can you make it gluten free",
        "we cannot eat dairy", "is the meal safe for a nut allergy", "do you serve vegan lunch",
        "my child is allergic to nuts", "can someone with allergies eat lunch", "dietary requirements",
    ],
    "cancellation": [
        "what is your cancellation policy", "can I get a refund", "how do I cancel",
        "is the deposit refundable", "what happens if we need to change plans", "can we move our booking",
        "may we undo the reservation", "our flight changed", "reschedule our visit",
    ],
    "availability": [
        "do you have space {date}", "can I book {offer} {date}", "is {offer} available",
        "please reserve for {count} people", "are you open {date}", "can we visit {date}",
        "any openings {date}", "do you have a free slot", "can you fit us in",
    ],
    "payment": [
        "can I pay by card", "do you accept cash", "how can we pay", "is mobile money accepted",
        "can I pay on arrival", "which payment methods do you take", "do you take visa",
        "only notes and coins", "can we use a credit card",
    ],
    "transport": [
        "can you arrange pickup", "is there a bus from town", "should we take a taxi",
        "how do we travel from the market", "do you offer a transfer", "is public transport available",
        "could someone collect us", "pickup at ondera market", "how do we get there by minibus",
    ],
    "weather": [
        "what happens if it rains", "does the tour run in bad weather", "is there a rain plan",
        "will you cancel because of the storm", "can we visit when it is wet", "is the walk covered",
        "will heavy rain stop the visit", "rain makes us move the booking", "weather policy",
    ],
    "suitability": [
        "is the walk suitable for children", "can an older guest join", "is it wheelchair accessible",
        "how difficult is the tour", "is this safe for a seven year old", "do I need to be fit",
        "my father walks slowly", "is the route manageable", "can children handle the walk",
    ],
}

HELD_OUT = [
    ("Could you quote the coffee experience for three?", ["price"]),
    ("Drop a map pin so our driver can locate you.", ["location"]),
    ("What is the earliest we may show up?", ["checkin"]),
    ("Will a party of eight fit?", ["capacity"]),
    ("My daughter is allergic to nuts. Can she eat lunch?", ["dietary"]),
    ("If our flight changes, may we undo the reservation?", ["cancellation"]),
    ("Any openings next Saturday for the roasting tour?", ["availability"]),
    ("Do you take Visa or only notes and coins?", ["payment"]),
    ("Could someone collect us at Ondera Market?", ["transport"]),
    ("Would heavy rain stop the farm visit?", ["weather"]),
    ("My father walks slowly. Is the route manageable?", ["suitability"]),
    ("How much is lunch and can you host six tomorrow?", ["price", "capacity", "availability"]),
    ("We need a vegan meal and one person has a dairy allergy.", ["dietary"]),
    ("Where do we meet, and can we get there by minibus?", ["location", "transport"]),
    ("Can we pay cash if rain makes us move the booking?", ["payment", "weather", "cancellation"]),
    ("Hello, I saw your farm online and have a question.", []),
    ("Thank you for the lovely coffee yesterday.", []),
]

FILLERS = [
    "hello noor", "hi there", "good morning", "please", "thanks", "we are planning our visit",
    "I found your farm online", "before we decide", "quick question", "for our holiday",
]
OFFERS = ["coffee tour", "farm lunch", "village walk", "coffee tasting", "farm visit"]
DATES = ["tomorrow", "this Friday", "next weekend", "on 12 October", "today"]
COUNTS = ["two", "three", "four", "six", "eight"]


def tokenize(text: str) -> list[str]:
    words = re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?", text.lower())
    return words + [f"{a}::{b}" for a, b in zip(words, words[1:])]


def render(phrase: str, rng: random.Random) -> str:
    return phrase.format(offer=rng.choice(OFFERS), date=rng.choice(DATES), count=rng.choice(COUNTS))


def build_dataset(count: int) -> list[dict[str, object]]:
    rng = random.Random(SEED)
    rows: list[dict[str, object]] = []
    for index in range(count):
        label_count = rng.choices([1, 2, 3], weights=[72, 23, 5], k=1)[0]
        labels = sorted(rng.sample(LABELS, label_count))
        parts = [render(rng.choice(TRAIN_PHRASES[label]), rng) for label in labels]
        rng.shuffle(parts)
        if rng.random() < 0.65:
            parts.insert(0, rng.choice(FILLERS))
        if rng.random() < 0.25:
            parts.append(rng.choice(["can you help", "let me know", "thank you", "please reply soon"]))
        separator = rng.choice([". ", " and ", "; ", "? Also, "])
        rows.append({"id": f"synthetic-{index + 1:05d}", "text": separator.join(parts), "labels": labels, "synthetic": True})
    for index in range(max(80, count // 20)):
        text = rng.choice([
            "hello", "thank you for yesterday", "we enjoyed the coffee", "please reply when free",
            "I have a general question", "good afternoon from our family", "your photos look lovely",
        ])
        rows.append({"id": f"negative-{index + 1:05d}", "text": text, "labels": [], "synthetic": True})
    rng.shuffle(rows)
    return rows


def vectorize(rows: list[dict[str, object]], vocabulary: list[str]) -> torch.Tensor:
    lookup = {token: index for index, token in enumerate(vocabulary)}
    matrix = torch.zeros((len(rows), len(vocabulary)), dtype=torch.float32)
    for row_index, row in enumerate(rows):
        counts = Counter(tokenize(str(row["text"])))
        norm = math.sqrt(sum(value * value for value in counts.values())) or 1.0
        for token, value in counts.items():
            if token in lookup:
                matrix[row_index, lookup[token]] = value / norm
    return matrix


def targets(rows: list[dict[str, object]]) -> torch.Tensor:
    result = torch.zeros((len(rows), len(LABELS)), dtype=torch.float32)
    for row_index, row in enumerate(rows):
        for label in row["labels"]:
            result[row_index, LABELS.index(str(label))] = 1.0
    return result


def scores(logits: torch.Tensor, truth: torch.Tensor, thresholds: torch.Tensor) -> dict[str, float]:
    prediction = (torch.sigmoid(logits) >= thresholds).float()
    true_positive = float((prediction * truth).sum())
    false_positive = float((prediction * (1 - truth)).sum())
    false_negative = float(((1 - prediction) * truth).sum())
    precision = true_positive / max(1.0, true_positive + false_positive)
    recall = true_positive / max(1.0, true_positive + false_negative)
    exact = float((prediction == truth).all(dim=1).float().mean())
    f1 = 2 * precision * recall / max(1e-9, precision + recall)
    return {"exact_match": exact, "micro_precision": precision, "micro_recall": recall, "micro_f1": f1}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--examples", type=int, default=5000)
    parser.add_argument("--epochs", type=int, default=240)
    parser.add_argument("--data", type=Path, default=Path("data/synthetic/tourism-intents.jsonl"))
    parser.add_argument("--model", type=Path, default=Path("src/models/tourism-intent-model.ts"))
    parser.add_argument("--report", type=Path, default=Path("output/training/tourism-intent-report.json"))
    args = parser.parse_args()

    random.seed(SEED)
    torch.manual_seed(SEED)
    torch.set_num_threads(min(4, torch.get_num_threads()))

    train_rows = build_dataset(args.examples)
    validation_rows = [
        {"id": f"held-out-{index + 1:03d}", "text": text, "labels": labels, "synthetic": False}
        for index, (text, labels) in enumerate(HELD_OUT)
    ]
    counts = Counter(token for row in train_rows for token in tokenize(str(row["text"])))
    vocabulary = [token for token, count in counts.most_common(900) if count >= 3]
    x_train, y_train = vectorize(train_rows, vocabulary), targets(train_rows)
    x_validation, y_validation = vectorize(validation_rows, vocabulary), targets(validation_rows)

    model = torch.nn.Linear(len(vocabulary), len(LABELS))
    loss_function = torch.nn.BCEWithLogitsLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.04, weight_decay=0.002)
    for _ in range(args.epochs):
        optimizer.zero_grad()
        loss = loss_function(model(x_train), y_train)
        loss.backward()
        optimizer.step()

    with torch.no_grad():
        validation_logits = model(x_validation)
        best_thresholds = []
        for column in range(len(LABELS)):
            best = (0.5, -1.0, -1.0)
            for threshold in [value / 100 for value in range(20, 81, 2)]:
                metrics = scores(validation_logits[:, [column]], y_validation[:, [column]], torch.tensor([threshold]))
                candidate = (metrics["micro_f1"], metrics["micro_precision"], threshold)
                if candidate > (best[1], best[2], best[0]):
                    best = (threshold, metrics["micro_f1"], metrics["micro_precision"])
            best_thresholds.append(best[0])
        threshold_tensor = torch.tensor(best_thresholds)
        report_metrics = scores(validation_logits, y_validation, threshold_tensor)
        probabilities = torch.sigmoid(validation_logits)

    args.data.parent.mkdir(parents=True, exist_ok=True)
    with args.data.open("w", encoding="utf-8") as stream:
        for row in train_rows:
            stream.write(json.dumps(row, ensure_ascii=False) + "\n")

    weights = model.weight.detach()
    export = {
        "name": "LokalPingu Tourism Intent Mini",
        "version": 1,
        "created": "2026-10-04",
        "task": "multi-label tourism guest-message intent classification",
        "trainingData": {"kind": "synthetic", "examples": len(train_rows), "seed": SEED},
        "labels": LABELS,
        "thresholds": [round(value, 4) for value in best_thresholds],
        "vocabulary": vocabulary,
        "weights": [[round(float(value), 6) for value in row] for row in weights],
        "bias": [round(float(value), 6) for value in model.bias.detach()],
        "validation": {key: round(value, 6) for key, value in report_metrics.items()},
    }
    args.model.parent.mkdir(parents=True, exist_ok=True)
    args.model.write_text(
        "// Generated by scripts/train_tourism_intent_model.py. Do not edit.\nexport default "
        + json.dumps(export, separators=(",", ":"))
        + " as const;\n",
        encoding="utf-8",
    )

    cases = []
    predicted = probabilities >= threshold_tensor
    for row, row_probs, row_pred in zip(validation_rows, probabilities, predicted):
        cases.append({
            "text": row["text"],
            "expected": row["labels"],
            "predicted": [LABELS[i] for i, active in enumerate(row_pred.tolist()) if active],
            "scores": {LABELS[i]: round(float(score), 4) for i, score in enumerate(row_probs) if score >= 0.1},
        })
    report = {
        "model": export["name"],
        "metrics": export["validation"],
        "modelBytes": len(args.model.read_bytes()),
        "trainingExamples": len(train_rows),
        "validationExamples": len(validation_rows),
        "cases": cases,
        "limitations": [
            "Training messages are synthetic English tourism enquiries.",
            "Held-out validation is small and manually authored; metrics are directional, not a field benchmark.",
            "The classifier routes messages only. It never supplies business facts or confirms bookings.",
        ],
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"loss": round(float(loss.detach()), 6), **report_metrics, "model_bytes": report["modelBytes"]}, indent=2))


if __name__ == "__main__":
    main()
