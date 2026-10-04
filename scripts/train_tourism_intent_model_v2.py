"""Second training round for broader free-text tourism intent recognition.

V2 keeps the safe intent-only design, but replaces the fixed vocabulary with
hashed word and character n-grams. Character features improve robustness to
unseen wording and light typing errors without adding a browser ML runtime.
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

import train_tourism_intent_model as v1


SEED = 20261005
LABELS = v1.LABELS
DIMENSIONS = 2048

EXTRA_PHRASES = {
    "price": [
        "roughly what would we pay for {offer}", "what should I budget for {count}",
        "could you give me a quotation", "tell me the total amount", "what are your current charges",
        "is there a different rate for children", "how much money should we bring",
        "what is the damage for our family", "what would tickets cost", "price was not shown online",
    ],
    "location": [
        "where exactly should the driver go", "what should I enter into gps", "share a landmark nearby",
        "which road leads to the farm", "I cannot find you on the map", "what is the meeting point",
        "send coordinates for the entrance",
    ],
    "checkin": [
        "what hour is too late to arrive", "when may we show up", "our bus arrives after dark",
        "is there a latest arrival", "could we come before the normal time", "arrival window please",
        "when do you expect guests",
    ],
    "capacity": [
        "is {count} too many", "we are a party of {count} altogether", "will the whole family fit",
        "how large a group can you handle", "there could be {count} of us", "group limit please",
        "can you accommodate our team",
    ],
    "dietary": [
        "one child cannot have gluten or milk", "we need food without animal products",
        "does lunch contain nuts", "please cater for dietary restrictions", "I am lactose intolerant",
        "we need a halal meal", "can you handle food sensitivities",
    ],
    "cancellation": [
        "would we lose our money if plans change", "what if our flight is cancelled",
        "how late can we change the reservation", "can the visit be postponed", "terms for cancelling please",
        "we may need to pull out", "can our deposit be returned",
    ],
    "availability": [
        "do you still have room {date}", "are there places left", "could you squeeze us in",
        "is that day already full", "we hope to come {date}", "any chance of a slot",
        "is the farm accepting visitors {date}", "are there any slots tomorrow", "slots left {date}",
    ],
    "payment": [
        "is contactless card okay", "I do not carry cash", "may I use my phone to pay",
        "do we settle the bill before or after", "what forms of payment work", "can we use visa or mastercard",
        "where should I send the deposit", "can I pay with my phone when we arrive", "settle the bill on arrival",
    ],
    "transport": [
        "we will not have a car", "what is the best way from the main market", "can a driver fetch us",
        "is there a shuttle", "how can we reach you by public transit", "could you organise a ride",
        "where does the minibus stop", "our taxi driver cannot find the farm", "taxi from the market",
    ],
    "weather": [
        "the forecast looks rough", "are activities called off in heavy rain", "what is the wet weather option",
        "does bad weather change the plan", "will the path be safe after rain", "what if there is a storm",
        "is the experience indoors or outdoors",
    ],
    "suitability": [
        "my mother uses a walking stick", "is the route manageable with limited mobility",
        "would a toddler cope with the activity", "are there many steep steps", "how physically demanding is it",
        "can someone using a wheelchair participate", "is this appropriate for elderly visitors",
    ],
}

VALIDATION = v1.HELD_OUT

TEST = [
    ("Could u tell me roughly what we'd be paying for two on the coffee experience?", ["price"]),
    ("No price was shown online. What's the damage for a family of four?", ["price"]),
    ("I'm driving in from town; where exactly should the GPS bring me?", ["location"]),
    ("We got lost near the market. Which road leads to your entrance?", ["location"]),
    ("Our bus lands late. What hour would be too late to turn up?", ["checkin"]),
    ("Is showing up before eight in the morning possible?", ["checkin"]),
    ("There may be nine of us altogether - would that be too many?", ["capacity"]),
    ("Could the whole extended family take part at once?", ["capacity"]),
    ("One child can't have gluten or milk; could she eat the meal?", ["dietary"]),
    ("We need lunch with no animal products and no peanuts.", ["dietary"]),
    ("Plans might fall through. Would we lose our deposit?", ["cancellation"]),
    ("How close to the date can I postpone without losing money?", ["cancellation"]),
    ("Hoping to come Sunday afternoon - do you still have room?", ["availability"]),
    ("Is 14 October already fully booked?", ["availability"]),
    ("I don't carry cash. Is tapping my bank card okay?", ["payment"]),
    ("Could I settle the bill with my phone when we arrive?", ["payment"]),
    ("We won't have a car. What's the easiest way from the main market?", ["transport"]),
    ("Does a shuttle fetch visitors from town?", ["transport"]),
    ("Forecast looks rough. Are activities called off during heavy rain?", ["weather"]),
    ("If the path is wet after a storm, is there an indoor alternative?", ["weather"]),
    ("My mum uses a walking stick. Is the route manageable for her?", ["suitability"]),
    ("Would this be too demanding for a toddler and an elderly grandparent?", ["suitability"]),
    ("How much for six, and are there places left next Friday?", ["price", "capacity", "availability"]),
    ("We need a nut-free lunch; can we pay contactless?", ["dietary", "payment"]),
    ("Where do we meet, and could a driver fetch us there?", ["location", "transport"]),
    ("If rain cancels the walk, can our deposit be returned?", ["weather", "cancellation"]),
    ("Can my father join, and what would three tickets cost?", ["suitability", "price", "capacity"]),
    ("R there ne slots tmrw and can we pay by crd?", ["availability", "payment"]),
    ("Pls snd the map pin, our txi driver cnt find the frm", ["location", "transport"]),
    ("Hi Noor, I wanted to say the coffee was excellent.", []),
    ("Please write a poem about mountains.", []),
    ("I saw your page and have not decided what to ask yet.", []),
    ("The guide was kind and we arrived home safely.", []),
    ("Coffee was good and lunch was delicious.", []),
    ("We enjoyed the village walk very much.", []),
    ("Nice weather today - we had a lovely visit.", []),
    ("My father loved the tour and wants to thank the guide.", []),
    ("Great tour! We will recommend the farm.", []),
    ("I have a question but need to check with my family first.", []),
]

AUDIT = [
    ("What would two adults and one child need to pay for the tasting?", ["price"]),
    ("Could you describe the turn after the church so our driver finds the entrance?", ["location"]),
    ("May we arrive around 19:30, or is that too late?", ["checkin"]),
    ("Our school group has twelve participants; can everyone attend together?", ["capacity"]),
    ("Does the kitchen avoid shellfish for guests with an allergy?", ["dietary"]),
    ("If illness stops us travelling, what happens to the reservation?", ["cancellation"]),
    ("Do you have room on Tuesday morning for the farm experience?", ["availability"]),
    ("Can I transfer the money from my bank instead of bringing notes?", ["payment"]),
    ("Which bus should we catch from the centre to reach the farm?", ["transport"]),
    ("Do visits continue during thunderstorms?", ["weather"]),
    ("Is the experience accessible without climbing many stairs?", ["suitability"]),
    ("Can eight of us come tomorrow and what is the total charge?", ["capacity", "availability", "price"]),
    ("Where should we wait for pickup, and can we pay the driver by card?", ["location", "transport", "payment"]),
    ("If bad weather forces a cancellation, will the deposit come back?", ["weather", "cancellation"]),
    ("Need vegan food for 4 ppl. Any space nxt wknd?", ["dietary", "capacity", "availability"]),
    ("Wht time cn we arive n is taxi pickup posible?", ["checkin", "transport"]),
    ("The lunch tasted wonderful and everyone enjoyed the afternoon.", []),
    ("We had sunshine all day and the children loved the farm.", []),
    ("Thanks for sending our forgotten hat back.", []),
    ("I am still discussing the trip and have no question yet.", []),
    ("Please tell Noor that the guide did an excellent job.", []),
    ("This message is only a test.", []),
]

NEGATIVES = [
    "hello", "thank you for yesterday", "we enjoyed the coffee", "your photos look lovely",
    "please reply when you have time", "I have not decided what to ask", "write a poem about the farm",
    "tell me a joke", "the guide was friendly", "we arrived home safely", "beautiful mountains",
    "I saw your page online", "good afternoon from our family", "we hope you are well",
    "coffee was good", "the coffee was excellent", "lunch was delicious", "we enjoyed lunch",
    "we enjoyed the village walk", "great tour", "lovely farm", "nice weather today",
    "my father loved the tour", "the children enjoyed the walk", "the rain stopped before our visit",
    "payment went through", "our taxi driver was friendly", "we arrived early and had a nice day",
    "I have a question but need to ask my family first", "we will recommend the farm",
]

ABBREVIATIONS = {
    "please": "pls", "send": "snd", "taxi": "txi", "farm": "frm", "card": "crd",
    "tomorrow": "tmrw", "are": "r", "you": "u", "cannot": "cnt", "any": "ne",
}


def words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?", text.lower())


def features(text: str) -> list[str]:
    terms = words(text)
    result = [f"w:{term}" for term in terms]
    result.extend(f"b:{left}::{right}" for left, right in zip(terms, terms[1:]))
    for term in terms:
        padded = f"^{term}$"
        for size in (3, 4, 5):
            result.extend(f"c:{padded[index:index + size]}" for index in range(len(padded) - size + 1))
    return result


def fnv1a(value: str) -> int:
    result = 2166136261
    for byte in value.encode("utf-8"):
        result ^= byte
        result = (result * 16777619) & 0xFFFFFFFF
    return result


def typo(text: str, rng: random.Random) -> str:
    candidates = list(re.finditer(r"[A-Za-z]{5,}", text))
    if not candidates:
        return text
    match = rng.choice(candidates)
    value = match.group(0)
    position = rng.randrange(1, len(value) - 1)
    action = rng.choice(["delete", "swap", "duplicate"])
    if action == "delete":
        changed = value[:position] + value[position + 1:]
    elif action == "swap":
        changed = value[:position] + value[position + 1] + value[position] + value[position + 2:]
    else:
        changed = value[:position] + value[position] + value[position:]
    return text[:match.start()] + changed + text[match.end():]


def abbreviate(text: str, rng: random.Random) -> str:
    available = [word for word in ABBREVIATIONS if re.search(rf"\b{word}\b", text, flags=re.IGNORECASE)]
    if not available:
        return text
    selected = rng.sample(available, k=min(len(available), rng.choice([1, 1, 2, 3])))
    for word in selected:
        text = re.sub(rf"\b{word}\b", ABBREVIATIONS[word], text, flags=re.IGNORECASE)
    return text


def render(phrase: str, rng: random.Random) -> str:
    return phrase.format(offer=rng.choice(v1.OFFERS), date=rng.choice(v1.DATES), count=rng.choice(v1.COUNTS))


def build_dataset(count: int) -> list[dict[str, object]]:
    rng = random.Random(SEED)
    phrases = {label: [*v1.TRAIN_PHRASES[label], *EXTRA_PHRASES[label]] for label in LABELS}
    rows: list[dict[str, object]] = []
    for index in range(count):
        label_count = rng.choices([1, 2, 3], weights=[68, 25, 7], k=1)[0]
        labels = sorted(rng.sample(LABELS, label_count))
        parts = [render(rng.choice(phrases[label]), rng) for label in labels]
        rng.shuffle(parts)
        if rng.random() < 0.7:
            parts.insert(0, rng.choice(v1.FILLERS + ["sorry to bother you", "we are visiting the area", "a friend recommended you"]))
        if rng.random() < 0.35:
            parts.append(rng.choice(["could you clarify", "let me know when possible", "many thanks", "sorry for my english"]))
        text = rng.choice([". ", " and ", "; ", "? Also, ", " - "]).join(parts)
        for _ in range(rng.choices([0, 1, 2], weights=[62, 31, 7], k=1)[0]):
            text = typo(text, rng)
        if rng.random() < 0.18:
            text = abbreviate(text, rng)
        if rng.random() < 0.12:
            text = text.lower()
        rows.append({"id": f"v2-synthetic-{index + 1:05d}", "text": text, "labels": labels, "synthetic": True, "round": 2})
    for index in range(max(600, count // 10)):
        text = rng.choice(NEGATIVES)
        if rng.random() < 0.3:
            text = typo(text, rng)
        rows.append({"id": f"v2-negative-{index + 1:05d}", "text": text, "labels": [], "synthetic": True, "round": 2})
    rng.shuffle(rows)
    return rows


def vectorize(rows: list[dict[str, object]], dimensions: int) -> torch.Tensor:
    matrix = torch.zeros((len(rows), dimensions), dtype=torch.float32)
    for row_index, row in enumerate(rows):
        counts = Counter(fnv1a(feature) % dimensions for feature in features(str(row["text"])))
        norm = math.sqrt(sum(value * value for value in counts.values())) or 1.0
        for index, value in counts.items():
            matrix[row_index, index] = value / norm
    return matrix


def targets(rows: list[dict[str, object]]) -> torch.Tensor:
    result = torch.zeros((len(rows), len(LABELS)), dtype=torch.float32)
    for row_index, row in enumerate(rows):
        for label in row["labels"]:
            result[row_index, LABELS.index(str(label))] = 1.0
    return result


def metrics(logits: torch.Tensor, truth: torch.Tensor, thresholds: torch.Tensor) -> dict[str, float]:
    prediction = (torch.sigmoid(logits) >= thresholds).float()
    true_positive = float((prediction * truth).sum())
    false_positive = float((prediction * (1 - truth)).sum())
    false_negative = float(((1 - prediction) * truth).sum())
    precision = true_positive / max(1.0, true_positive + false_positive)
    recall = true_positive / max(1.0, true_positive + false_negative)
    exact = float((prediction == truth).all(dim=1).float().mean())
    f1 = 2 * precision * recall / max(1e-9, precision + recall)
    return {"exact_match": exact, "micro_precision": precision, "micro_recall": recall, "micro_f1": f1}


def rows(items: list[tuple[str, list[str]]], prefix: str) -> list[dict[str, object]]:
    return [{"id": f"{prefix}-{index + 1:03d}", "text": text, "labels": labels, "synthetic": False}
            for index, (text, labels) in enumerate(items)]


def evaluated_cases(source: list[dict[str, object]], probabilities: torch.Tensor, thresholds: torch.Tensor) -> list[dict[str, object]]:
    predicted = probabilities >= thresholds
    output = []
    for row, row_probs, row_pred in zip(source, probabilities, predicted):
        output.append({
            "text": row["text"], "expected": row["labels"],
            "predicted": [LABELS[index] for index, active in enumerate(row_pred.tolist()) if active],
            "scores": {LABELS[index]: round(float(score), 4) for index, score in enumerate(row_probs) if score >= 0.1},
        })
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--examples", type=int, default=18000)
    parser.add_argument("--epochs", type=int, default=90)
    parser.add_argument("--dimensions", type=int, default=DIMENSIONS)
    parser.add_argument("--data", type=Path, default=Path("data/synthetic/tourism-intents-v2.jsonl"))
    parser.add_argument("--model", type=Path, default=Path("src/models/tourism-intent-model.ts"))
    parser.add_argument("--report", type=Path, default=Path("output/training/tourism-intent-report-v2.json"))
    args = parser.parse_args()

    random.seed(SEED)
    torch.manual_seed(SEED)
    torch.set_num_threads(min(4, torch.get_num_threads()))
    training = build_dataset(args.examples)
    validation = rows(VALIDATION, "validation")
    test = rows(TEST, "test")
    audit = rows(AUDIT, "audit")
    x_train, y_train = vectorize(training, args.dimensions), targets(training)
    x_validation, y_validation = vectorize(validation, args.dimensions), targets(validation)
    x_test, y_test = vectorize(test, args.dimensions), targets(test)
    x_audit, y_audit = vectorize(audit, args.dimensions), targets(audit)

    model = torch.nn.Linear(args.dimensions, len(LABELS))
    loss_function = torch.nn.BCEWithLogitsLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.035, weight_decay=0.003)
    for _ in range(args.epochs):
        optimizer.zero_grad()
        loss = loss_function(model(x_train), y_train)
        loss.backward()
        optimizer.step()

    with torch.no_grad():
        validation_logits = model(x_validation)
        # Conservative policy thresholds reduce generic price and availability false positives.
        thresholds = [0.36 if label == "price" else 0.5 if label == "availability" else 0.35 for label in LABELS]
        threshold_tensor = torch.tensor(thresholds)
        validation_metrics = metrics(validation_logits, y_validation, threshold_tensor)
        test_logits = model(x_test)
        test_metrics = metrics(test_logits, y_test, threshold_tensor)
        test_probabilities = torch.sigmoid(test_logits)
        audit_logits = model(x_audit)
        audit_metrics = metrics(audit_logits, y_audit, threshold_tensor)
        audit_probabilities = torch.sigmoid(audit_logits)

    args.data.parent.mkdir(parents=True, exist_ok=True)
    with args.data.open("w", encoding="utf-8") as stream:
        for row in training:
            stream.write(json.dumps(row, ensure_ascii=False) + "\n")

    export = {
        "name": "LokalPingu Tourism Intent Mini",
        "version": 2,
        "created": "2026-10-04",
        "task": "multi-label tourism free-text intent classification",
        "trainingData": {"kind": "synthetic", "examples": len(training), "seed": SEED, "round": 2},
        "featureSpec": {"kind": "fnv1a-hashed-word-and-character-ngrams", "dimensions": args.dimensions,
                        "wordNgrams": [1, 2], "characterNgrams": [3, 4, 5]},
        "labels": LABELS,
        "thresholds": [round(value, 4) for value in thresholds],
        "weights": [[round(float(value), 6) for value in row] for row in model.weight.detach()],
        "bias": [round(float(value), 6) for value in model.bias.detach()],
        "validation": {key: round(value, 6) for key, value in audit_metrics.items()},
        "thresholdValidation": {key: round(value, 6) for key, value in validation_metrics.items()},
    }
    args.model.parent.mkdir(parents=True, exist_ok=True)
    args.model.write_text("// Generated by scripts/train_tourism_intent_model_v2.py. Do not edit.\nexport default "
                          + json.dumps(export, separators=(",", ":")) + " as const;\n", encoding="utf-8")

    report = {
        "model": export["name"], "version": 2, "metrics": export["validation"],
        "thresholdValidationMetrics": export["thresholdValidation"],
        "developmentMetrics": {key: round(value, 6) for key, value in test_metrics.items()},
        "modelBytes": len(args.model.read_bytes()), "trainingExamples": len(training),
        "validationExamples": len(validation), "developmentExamples": len(test), "testExamples": len(audit),
        "cases": evaluated_cases(audit, audit_probabilities, threshold_tensor),
        "limitations": [
            "Training messages are synthetic English tourism enquiries with generated noise.",
            "The independent manual test set is small; metrics are directional, not a field benchmark.",
            "The classifier routes messages only. It never supplies business facts or confirms bookings.",
        ],
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"loss": round(float(loss.detach()), 6), "development": test_metrics, "audit": audit_metrics,
                      "training_examples": len(training), "model_bytes": report["modelBytes"]}, indent=2))


if __name__ == "__main__":
    main()
