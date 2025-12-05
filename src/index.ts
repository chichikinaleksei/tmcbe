import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

type Item = { id: number };

const allItems = new Map<number, Item>();

const selectedSet = new Set<number>();
const selectedOrder: number[] = [];

function initData() {
  for (let i = 1; i <= 1_000_000; i++) {
    allItems.set(i, { id: i });
  }
  console.log(`Initialized ${allItems.size} items`);
}

initData();

type ChangeOp =
  | { type: "select"; id: number }
  | { type: "unselect"; id: number }
  | { type: "reorder"; newOrder: number[] };

const pendingSelectOps = new Map<number, "select" | "unselect">();

let pendingReorder: number[] | null = null;

function queueSelect(id: number) {
  pendingSelectOps.set(id, "select");
}

function queueUnselect(id: number) {
  pendingSelectOps.set(id, "unselect");
}

function queueReorder(newOrder: number[]) {
  pendingReorder = newOrder;
}

app.get("/items", (req, res) => {
  const filter = (req.query.filter as string) || "";
  const offset = parseInt((req.query.offset as string) || "0", 10);
  const limit = parseInt((req.query.limit as string) || "20", 10);

  const result: Item[] = [];

  for (const [id, item] of allItems) {
    if (selectedSet.has(id)) continue;
    if (filter && !id.toString().includes(filter)) continue;
    result.push(item);
  }

  const paginated = result.slice(offset, offset + limit);

  res.json({
    items: paginated,
    total: result.length,
  });
});

app.get("/selected", (req, res) => {
  const filter = (req.query.filter as string) || "";
  const offset = parseInt((req.query.offset as string) || "0", 10);
  const limit = parseInt((req.query.limit as string) || "20", 10);

  const out: Item[] = [];

  for (const id of selectedOrder) {
    if (filter && !id.toString().includes(filter)) continue;

    const item = allItems.get(id);
    if (item) out.push(item);
  }

  const paginated = out.slice(offset, offset + limit);

  res.json({
    items: paginated,
    total: out.length,
  });
});

const addQueue = new Set<number>();

app.post("/add", (req, res) => {
  const { id } = req.body;

  const numericId = Number(id);
  if (!numericId || numericId <= 0) {
    return res.status(400).json({ error: "Invalid ID" });
  }

  if (allItems.has(numericId)) {
    return res.status(409).json({ error: "ID already exists" });
  }

  addQueue.add(numericId);

  return res.status(202).json({ ok: true });
});

app.post("/select", (req, res) => {
  const { id } = req.body;
  queueSelect(Number(id));
  res.status(202).json({ ok: true });
});

app.post("/unselect", (req, res) => {
  const { id } = req.body;
  queueUnselect(Number(id));
  res.status(202).json({ ok: true });
});

app.post("/reorder", (req, res) => {
  const { newOrder } = req.body;

  if (!Array.isArray(newOrder)) {
    return res.status(400).json({ error: "newOrder must be an array" });
  }

  queueReorder(newOrder.map((x) => Number(x)));
  res.status(202).json({ ok: true });
});

setInterval(() => {
  if (pendingSelectOps.size > 0) {
    for (const [id, op] of pendingSelectOps.entries()) {
      if (op === "select") {
        if (!selectedSet.has(id)) {
          selectedSet.add(id);
          selectedOrder.push(id);
        }
      } else {
        if (selectedSet.has(id)) {
          selectedSet.delete(id);
          const idx = selectedOrder.indexOf(id);
          if (idx !== -1) selectedOrder.splice(idx, 1);
        }
      }
    }

    pendingSelectOps.clear();
    console.log("Applied select/unselect batch");
  }

  if (pendingReorder) {
    const subset = pendingReorder; // ids, которые перетаскивали
    const subsetSet = new Set(subset);

    // хвост — все остальные выбранные id, которые НЕ трогали
    const tail = selectedOrder.filter((id) => !subsetSet.has(id));

    selectedOrder.length = 0;
    selectedOrder.push(...subset, ...tail);

    selectedSet.clear();
    for (const id of selectedOrder) {
      selectedSet.add(id);
    }

    pendingReorder = null;
    console.log("Applied reorder batch");
  }

  }, 1000);

setInterval(() => {
  if (addQueue.size === 0) return;

  for (const id of addQueue) {
    if (!allItems.has(id)) {
      allItems.set(id, { id });
    }
  }

  addQueue.clear();
  console.log("Added new items batch");
}, 10_000);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
