"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { Check, Plus, Search, Sparkles, Upload, X } from "lucide-react";
import { words } from "@/data/cet4_core";
import type { Topic, WordItem } from "@/types/word";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const topicLabelMap: Record<Topic, string> = {
  emotion: "情绪",
  education: "教育",
  time_process: "时间 / 进程",
  society: "社会",
  technology: "技术",
};

const topicColorMap: Record<Topic, string> = {
  emotion: "#f97316",
  education: "#0f766e",
  time_process: "#2563eb",
  society: "#dc2626",
  technology: "#7c3aed",
};

type MemoryStatus = "new" | "learning" | "remembered";

type UserList = {
  id: string;
  name: string;
  wordIds: string[];
};

type StoredState = {
  customWords: WordItem[];
  lists: UserList[];
  activeListId: string;
  statuses: Record<string, MemoryStatus>;
};

const STORAGE_KEY = "nexora-phase1-state";
const defaultListId = "my-core-list";
const defaultLists: UserList[] = [
  {
    id: defaultListId,
    name: "我的核心词单",
    wordIds: words.map((item) => item.id),
  },
];

function slugifyWord(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase();
}

function inferTopic(value: string): Topic {
  const topic = normalizeToken(value);
  if (
    topic === "emotion" ||
    topic === "education" ||
    topic === "time_process" ||
    topic === "society" ||
    topic === "technology"
  ) {
    return topic;
  }

  return "education";
}

function createWordId(word: string, existingIds: Set<string>) {
  const base = slugifyWord(word) || `word-${existingIds.size + 1}`;
  let id = base;
  let suffix = 1;
  while (existingIds.has(id)) {
    suffix += 1;
    id = `${base}-${suffix}`;
  }
  return id;
}

function scoreRelation(source: WordItem, target: WordItem) {
  let score = 0;

  if (source.topic === target.topic) {
    score += 3;
  }

  const sourceMeanings = new Set(source.meanings.map(normalizeToken));
  const targetMeanings = new Set(target.meanings.map(normalizeToken));

  for (const meaning of sourceMeanings) {
    if (targetMeanings.has(meaning)) {
      score += 4;
    }
  }

  if (source.related.includes(target.id) || target.related.includes(source.id)) {
    score += 5;
  }

  if (source.opposite?.includes(target.id) || target.opposite?.includes(source.id)) {
    score += 5;
  }

  if (source.word[0] && target.word[0] && source.word[0] === target.word[0]) {
    score += 1;
  }

  return score;
}

function connectImportedWord(newWord: WordItem, candidates: WordItem[]) {
  const suggestions = candidates
    .filter((item) => item.id !== newWord.id)
    .map((item) => ({ id: item.id, score: scoreRelation(newWord, item) }))
    .filter((item) => item.score >= 4)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map((item) => item.id);

  return {
    ...newWord,
    related: Array.from(new Set([...newWord.related, ...suggestions])),
  };
}

function parseImportedWords(
  rawText: string,
  existingWords: WordItem[],
  listId: string,
) {
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const existingIds = new Set(existingWords.map((item) => item.id));
  const nextWords: WordItem[] = [];

  lines.forEach((line, index) => {
    const [wordPart, meaningsPart, topicPart, examplePart, hintPart] = line
      .split("|")
      .map((part) => part.trim());

    if (!wordPart || !meaningsPart) {
      return;
    }

    const id = createWordId(wordPart, existingIds);
    existingIds.add(id);

    const draft: WordItem = {
      id,
      word: wordPart,
      meanings: meaningsPart
        .split(/[;,，、]/)
        .map((item) => item.trim())
        .filter(Boolean),
      topic: inferTopic(topicPart ?? ""),
      example: examplePart || `${wordPart} is part of the ${listId} list.`,
      related: [],
      difficulty: "CET4",
      memoryHint: hintPart || `把 ${wordPart} 放进你自己的记忆路径里复习。`,
      x: 140 + (index % 3) * 180,
      y: 120 + Math.floor(index / 3) * 140,
    };

    const connected = connectImportedWord(draft, [...existingWords, ...nextWords]);
    nextWords.push(connected);
  });

  return nextWords;
}

function readStoredState(): StoredState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredState;
  } catch {
    return null;
  }
}

function buildEdges(items: WordItem[]): Edge[] {
  const ids = new Set(items.map((item) => item.id));

  return items.flatMap((item) =>
    item.related
      .filter((target) => ids.has(target))
      .map((target) => ({
        id: `${item.id}-${target}`,
        source: item.id,
        target,
        animated: item.opposite?.includes(target),
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 18,
          height: 18,
        },
        style: {
          stroke: item.opposite?.includes(target) ? "#dc2626" : "#b45309",
          strokeWidth: item.opposite?.includes(target) ? 1.6 : 1.2,
        },
      })),
  );
}

export default function WordSpacePrototype() {
  const storedState = readStoredState();
  const [customWords, setCustomWords] = useState<WordItem[]>(
    () => storedState?.customWords ?? [],
  );
  const [userLists, setUserLists] = useState<UserList[]>(
    () => storedState?.lists?.length ? storedState.lists : defaultLists,
  );
  const [activeListId, setActiveListId] = useState(
    () => storedState?.activeListId ?? defaultListId,
  );
  const [memoryStatusMap, setMemoryStatusMap] = useState<Record<string, MemoryStatus>>(
    () => storedState?.statuses ?? {},
  );
  const [query, setQuery] = useState("");
  const [activeTopic, setActiveTopic] = useState<"all" | Topic>("all");
  const [activeTab, setActiveTab] = useState("graph");
  const [selectedWordId, setSelectedWordId] = useState<string>(words[0]?.id ?? "");
  const [listName, setListName] = useState("");
  const [importText, setImportText] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");

  useEffect(() => {
    const payload: StoredState = {
      customWords,
      lists: userLists,
      activeListId,
      statuses: memoryStatusMap,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [activeListId, customWords, memoryStatusMap, userLists]);

  const allWords = useMemo(() => [...words, ...customWords], [customWords]);

  const activeList =
    userLists.find((item) => item.id === activeListId) ??
    userLists[0] ?? {
      id: defaultListId,
      name: "我的核心词单",
      wordIds: words.map((item) => item.id),
    };

  const activeListWords = useMemo(() => {
    const ids = new Set(activeList.wordIds);
    return allWords.filter((item) => ids.has(item.id));
  }, [activeList.wordIds, allWords]);

  const filteredWords = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return activeListWords.filter((item) => {
      const matchesTopic = activeTopic === "all" || item.topic === activeTopic;
      const matchesQuery =
        keyword.length === 0 ||
        item.word.toLowerCase().includes(keyword) ||
        item.meanings.some((meaning) => meaning.includes(keyword));

      return matchesTopic && matchesQuery;
    });
  }, [activeListWords, activeTopic, query]);

  const libraryMatches = useMemo(() => {
    const keyword = libraryQuery.trim().toLowerCase();
    const activeIds = new Set(activeList.wordIds);

    return words.filter((item) => {
      if (activeIds.has(item.id)) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return (
        item.word.toLowerCase().includes(keyword) ||
        item.meanings.some((meaning) => meaning.includes(keyword))
      );
    });
  }, [activeList.wordIds, libraryQuery]);

  const nodes: Node[] = useMemo(
    () =>
      filteredWords.map((item) => ({
        id: item.id,
        position: { x: item.x, y: item.y },
        data: {
          label: (
            <button
              type="button"
              onClick={() => setSelectedWordId(item.id)}
              className="min-w-[140px] rounded-2xl border border-white/70 bg-white/90 px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="text-sm font-semibold text-stone-900">{item.word}</div>
              <div className="mt-1 text-xs text-stone-500">
                {item.meanings.join(" / ")}
              </div>
            </button>
          ),
        },
        draggable: false,
        selectable: true,
        sourcePosition: "right",
        targetPosition: "left",
        style: {
          background: "transparent",
          border: "none",
          width: 160,
        },
      })),
    [filteredWords],
  );

  const edges = useMemo(() => buildEdges(filteredWords), [filteredWords]);

  const selectedWord =
    filteredWords.find((item) => item.id === selectedWordId) ??
    activeListWords.find((item) => item.id === selectedWordId) ??
    filteredWords[0] ??
    activeListWords[0];

  const rememberedCount = activeList.wordIds.filter(
    (id) => memoryStatusMap[id] === "remembered",
  ).length;

  const learningCount = activeList.wordIds.filter(
    (id) => memoryStatusMap[id] === "learning",
  ).length;

  function updateWordStatus(wordId: string, nextStatus: MemoryStatus) {
    setMemoryStatusMap((current) => ({
      ...current,
      [wordId]: nextStatus,
    }));
  }

  function addWordsToList(wordIds: string[]) {
    setUserLists((current) =>
      current.map((item) =>
        item.id === activeListId
          ? {
              ...item,
              wordIds: Array.from(new Set([...item.wordIds, ...wordIds])),
            }
          : item,
      ),
    );
  }

  function createList() {
    const name = listName.trim();
    if (!name) {
      return;
    }

    const id = createWordId(name, new Set(userLists.map((item) => item.id)));
    const nextList: UserList = {
      id,
      name,
      wordIds: [],
    };

    setUserLists((current) => [...current, nextList]);
    setActiveListId(id);
    setListName("");
  }

  function importCustomWords() {
    const parsed = parseImportedWords(importText, allWords, activeListId);
    if (parsed.length === 0) {
      return;
    }

    setCustomWords((current) => [...current, ...parsed]);
    addWordsToList(parsed.map((item) => item.id));
    if (!selectedWordId && parsed[0]) {
      setSelectedWordId(parsed[0].id);
    }
    setImportText("");
  }

  return (
    <main className="min-h-screen overflow-hidden px-4 py-6 text-stone-900 md:px-8">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[320px_minmax(0,1fr)]"
      >
        <Card className="border-white/70 bg-white/70">
          <CardHeader className="space-y-4">
            <Badge className="w-fit">Nexora Prototype</Badge>
            <div className="space-y-2">
              <CardTitle className="text-2xl">Nexora 词图记忆空间</CardTitle>
              <p className="text-sm leading-6 text-stone-600">
                用图谱组织词义、联想和复习路径，让单词记忆从线性背诵变成空间化探索。
              </p>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-10"
                placeholder="搜索单词或中文释义"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Card className="bg-white/80">
              <CardHeader className="space-y-3">
                <CardTitle className="text-base">我的词单</CardTitle>
                <div className="flex gap-2">
                  <Input
                    value={listName}
                    onChange={(event) => setListName(event.target.value)}
                    placeholder="新词单名称"
                  />
                  <Button onClick={createList}>
                    <Plus className="mr-2 size-4" />
                    新建
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="flex flex-wrap gap-2">
                  {userLists.map((item) => (
                    <Button
                      key={item.id}
                      variant={activeListId === item.id ? "default" : "outline"}
                      onClick={() => setActiveListId(item.id)}
                    >
                      {item.name}
                    </Button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl bg-stone-100 p-3">
                    <div className="text-lg font-semibold">{activeList.wordIds.length}</div>
                    <div className="text-xs text-stone-500">总词数</div>
                  </div>
                  <div className="rounded-2xl bg-amber-50 p-3">
                    <div className="text-lg font-semibold text-amber-700">
                      {learningCount}
                    </div>
                    <div className="text-xs text-stone-500">学习中</div>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 p-3">
                    <div className="text-lg font-semibold text-emerald-700">
                      {rememberedCount}
                    </div>
                    <div className="text-xs text-stone-500">已记住</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/80">
              <CardHeader className="space-y-3">
                <CardTitle className="text-base">从词库添加</CardTitle>
                <Input
                  value={libraryQuery}
                  onChange={(event) => setLibraryQuery(event.target.value)}
                  placeholder="搜索内置词库后加入当前词单"
                />
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {libraryMatches.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-3"
                  >
                    <div>
                      <div className="text-sm font-semibold">{item.word}</div>
                      <div className="text-xs text-stone-500">
                        {item.meanings.join(" / ")}
                      </div>
                    </div>
                    <Button onClick={() => addWordsToList([item.id])}>添加</Button>
                  </div>
                ))}
                {libraryMatches.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-stone-200 p-3 text-sm text-stone-500">
                    当前没有可添加的内置词。
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="bg-white/80">
              <CardHeader className="space-y-2">
                <CardTitle className="text-base">导入自定义词汇</CardTitle>
                <p className="text-xs leading-5 text-stone-500">
                  每行一个词，格式：`word | 中文1,中文2 | topic | example | memoryHint`
                </p>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <textarea
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  className="min-h-32 w-full rounded-2xl border border-stone-300 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  placeholder={
                    "resilient | 有韧性的, 能恢复的 | emotion | She remained resilient after failure. | 把它想成会弹回来的橡皮球"
                  }
                />
                <Button onClick={importCustomWords}>
                  <Upload className="mr-2 size-4" />
                  导入到当前词单
                </Button>
              </CardContent>
            </Card>

            <div className="flex flex-wrap gap-2">
              <Button
                variant={activeTopic === "all" ? "default" : "outline"}
                onClick={() => setActiveTopic("all")}
              >
                全部
              </Button>
              {Object.entries(topicLabelMap).map(([topic, label]) => (
                <Button
                  key={topic}
                  variant={activeTopic === topic ? "default" : "outline"}
                  onClick={() => setActiveTopic(topic as Topic)}
                >
                  {label}
                </Button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {selectedWord ? (
                <motion.div
                  key={selectedWord.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="bg-stone-950 text-stone-50">
                    <CardHeader className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-2xl font-semibold">{selectedWord.word}</div>
                          <div className="mt-2 text-sm text-stone-300">
                            {selectedWord.meanings.join(" / ")}
                          </div>
                        </div>
                        <Badge className="bg-white/10 text-white">
                          {selectedWord.difficulty}
                        </Badge>
                      </div>
                      <div className="text-xs uppercase tracking-[0.16em] text-stone-400">
                        {topicLabelMap[selectedWord.topic]}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm leading-6 text-stone-200">
                      <div>
                        <div className="mb-1 text-xs uppercase tracking-[0.16em] text-stone-400">
                          Example
                        </div>
                        <p>{selectedWord.example}</p>
                      </div>
                      <div>
                        <div className="mb-1 text-xs uppercase tracking-[0.16em] text-stone-400">
                          Memory Hint
                        </div>
                        <p>{selectedWord.memoryHint}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedWord.related.map((item) => (
                          <Badge
                            key={item}
                            className="bg-white/10 text-white/90"
                          >
                            {item}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant={
                            memoryStatusMap[selectedWord.id] === "remembered"
                              ? "default"
                              : "outline"
                          }
                          onClick={() => updateWordStatus(selectedWord.id, "remembered")}
                        >
                          <Check className="mr-2 size-4" />
                          记住了
                        </Button>
                        <Button
                          variant={
                            memoryStatusMap[selectedWord.id] === "learning"
                              ? "secondary"
                              : "outline"
                          }
                          onClick={() => updateWordStatus(selectedWord.id, "learning")}
                        >
                          还在学
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => updateWordStatus(selectedWord.id, "new")}
                        >
                          <X className="mr-2 size-4" />
                          重置
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="flex flex-col gap-4 border-b border-stone-200/80 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-5 text-amber-600" />
                Nexora Graph
              </CardTitle>
              <p className="mt-2 text-sm text-stone-600">
                点击节点查看词义、例句和记忆提示。当前词单展示 {filteredWords.length} 个词。
              </p>
            </div>
            <Tabs
              defaultValue="graph"
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex-shrink-0"
            >
              <TabsList>
                <TabsTrigger value="graph">图谱</TabsTrigger>
                <TabsTrigger value="list">列表</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="p-0">
            <Tabs defaultValue="graph" value={activeTab} onValueChange={setActiveTab}>
              <TabsContent value="graph" className="m-0">
                <div className="h-[720px] bg-[linear-gradient(135deg,rgba(255,251,235,0.92),rgba(255,255,255,0.75))]">
                  <ReactFlow
                    fitView
                    nodes={nodes}
                    edges={edges}
                    onNodeClick={(_, node) => setSelectedWordId(node.id)}
                    proOptions={{ hideAttribution: true }}
                    defaultEdgeOptions={{
                      type: "smoothstep",
                    }}
                  >
                    <MiniMap
                      pannable
                      zoomable
                      style={{
                        backgroundColor: "rgba(255,255,255,0.75)",
                      }}
                      nodeColor={(node) => {
                        const item = filteredWords.find((word) => word.id === node.id);
                        return item ? topicColorMap[item.topic] : "#a8a29e";
                      }}
                    />
                    <Controls />
                    <Background color="#d6d3d1" gap={18} size={1.2} />
                  </ReactFlow>
                </div>
              </TabsContent>
              <TabsContent value="list" className="m-0 p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  {filteredWords.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedWordId(item.id)}
                      className="rounded-[24px] border border-stone-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-lg font-semibold">{item.word}</div>
                        <Badge>
                          {memoryStatusMap[item.id] === "remembered"
                            ? "已记住"
                            : memoryStatusMap[item.id] === "learning"
                              ? "学习中"
                              : item.difficulty}
                        </Badge>
                      </div>
                      <div className="mt-2 text-sm text-stone-600">
                        {item.meanings.join(" / ")}
                      </div>
                      <div className="mt-4 text-xs uppercase tracking-[0.16em] text-stone-400">
                        {topicLabelMap[item.topic]}
                      </div>
                    </button>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>
    </main>
  );
}
