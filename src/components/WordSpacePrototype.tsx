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
import {
  Check,
  Plus,
  Search,
  Sparkles,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import { cet4Catalog } from "@/data/cet4_catalog";
import { seedRelations, words } from "@/data/cet4_core";
import type { Topic, WordItem, WordRelation } from "@/types/word";
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

const topicOrder: Topic[] = [
  "education",
  "time_process",
  "society",
  "technology",
  "emotion",
];

type MemoryStatus = "new" | "learning" | "remembered";

type UserList = {
  id: string;
  name: string;
  wordIds: string[];
};

type StoredState = {
  customWords: WordItem[];
  customRelations: WordRelation[];
  lists: UserList[];
  activeListId: string;
  statuses: Record<string, MemoryStatus>;
};

const STORAGE_KEY = "nexora-phase3-state";
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
  let relationType: WordRelation["type"] = "semantic";

  if (source.topic === target.topic) {
    score += 3;
    relationType = "topic";
  }

  const sourceMeanings = new Set(source.meanings.map(normalizeToken));
  const targetMeanings = new Set(target.meanings.map(normalizeToken));

  for (const meaning of sourceMeanings) {
    if (targetMeanings.has(meaning)) {
      score += 4;
      relationType = "semantic";
    }
  }

  if (source.opposite?.includes(target.id) || target.opposite?.includes(source.id)) {
    score += 5;
    relationType = "opposite";
  }

  if (source.word[0] && target.word[0] && source.word[0] === target.word[0]) {
    score += 1;
  }

  return { score, relationType };
}

function createAutoRelations(newWord: WordItem, candidates: WordItem[]) {
  return candidates
    .filter((item) => item.id !== newWord.id)
    .map((item) => ({
      targetWordId: item.id,
      ...scoreRelation(newWord, item),
    }))
    .filter((item) => item.score >= 4)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map((item) => ({
      id: `${newWord.id}-${item.targetWordId}-auto`,
      sourceWordId: newWord.id,
      targetWordId: item.targetWordId,
      type: item.relationType === "opposite" ? "opposite" : "imported",
      strength: Math.min(0.99, item.score / 10),
      source: "auto" as const,
    }));
}

function parseImportedWords(rawText: string, existingWords: WordItem[], listId: string) {
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const existingIds = new Set(existingWords.map((item) => item.id));
  const nextWords: WordItem[] = [];
  const nextRelations: WordRelation[] = [];

  lines.forEach((line) => {
    const [wordPart, meaningsPart, topicPart, examplePart, hintPart, phoneticPart] =
      line.split("|").map((part) => part.trim());

    if (!wordPart || !meaningsPart) {
      return;
    }

    const id = createWordId(wordPart, existingIds);
    existingIds.add(id);

    const draft: WordItem = {
      id,
      word: wordPart,
      phonetic: phoneticPart || undefined,
      meanings: meaningsPart
        .split(/[;,，、]/)
        .map((item) => item.trim())
        .filter(Boolean),
      topic: inferTopic(topicPart ?? ""),
      example: examplePart || `${wordPart} is part of the ${listId} list.`,
      related: [],
      difficulty: "CET4",
      memoryHint: hintPart || `把 ${wordPart} 放进你自己的记忆路径里复习。`,
      x: 0,
      y: 0,
      audioUrl: undefined,
    };

    nextWords.push(draft);
    nextRelations.push(
      ...createAutoRelations(draft, [...existingWords, ...nextWords.slice(0, -1)]),
    );
  });

  return { words: nextWords, relations: nextRelations };
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

function buildRelationEdges(items: WordItem[], relations: WordRelation[]): Edge[] {
  const ids = new Set(items.map((item) => item.id));

  return relations
    .filter(
      (relation) =>
        ids.has(relation.sourceWordId) && ids.has(relation.targetWordId),
    )
    .map((relation) => ({
      id: relation.id,
      source: relation.sourceWordId,
      target: relation.targetWordId,
      animated: relation.type === "opposite",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
      },
      label:
        relation.type === "opposite"
          ? "反义"
          : relation.type === "topic"
            ? "同主题"
            : relation.type === "imported"
              ? "推荐"
              : "相关",
      labelStyle: {
        fill: "#78716c",
        fontSize: 10,
      },
      style: {
        stroke:
          relation.type === "opposite"
            ? "#dc2626"
            : relation.type === "topic"
              ? "#2563eb"
              : "#b45309",
        strokeWidth: 1.2 + relation.strength,
      },
    }));
}

function playWordAudio(word: WordItem) {
  if (typeof window === "undefined") {
    return;
  }

  if (word.audioUrl) {
    const audio = new Audio(word.audioUrl);
    void audio.play().catch(() => {});
    return;
  }

  if (!("speechSynthesis" in window)) {
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word.word);
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

export default function WordSpacePrototype() {
  const storedState = readStoredState();
  const [customWords, setCustomWords] = useState<WordItem[]>(
    () => storedState?.customWords ?? [],
  );
  const [customRelations, setCustomRelations] = useState<WordRelation[]>(
    () => storedState?.customRelations ?? [],
  );
  const [userLists, setUserLists] = useState<UserList[]>(
    () => (storedState?.lists?.length ? storedState.lists : defaultLists),
  );
  const [activeListId, setActiveListId] = useState(
    () => storedState?.activeListId ?? defaultListId,
  );
  const [memoryStatusMap, setMemoryStatusMap] = useState<Record<string, MemoryStatus>>(
    () => storedState?.statuses ?? {},
  );
  const [query, setQuery] = useState("");
  const [activeTopic, setActiveTopic] = useState<"all" | Topic>("all");
  const [activeTab, setActiveTab] = useState("focus");
  const [selectedWordId, setSelectedWordId] = useState<string>(words[0]?.id ?? "");
  const [listName, setListName] = useState("");
  const [importText, setImportText] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");

  useEffect(() => {
    const payload: StoredState = {
      customWords,
      customRelations,
      lists: userLists,
      activeListId,
      statuses: memoryStatusMap,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [activeListId, customRelations, customWords, memoryStatusMap, userLists]);

  const allWords = useMemo(() => [...words, ...customWords], [customWords]);
  const allRelations = useMemo(
    () => [...seedRelations, ...customRelations],
    [customRelations],
  );

  const activeList =
    userLists.find((item) => item.id === activeListId) ??
    userLists[0] ??
    defaultLists[0];

  const activeListWordIds = useMemo(
    () => new Set(activeList.wordIds),
    [activeList.wordIds],
  );

  const activeListWords = useMemo(
    () => allWords.filter((item) => activeListWordIds.has(item.id)),
    [activeListWordIds, allWords],
  );

  const activeListRelations = useMemo(
    () =>
      allRelations.filter(
        (relation) =>
          activeListWordIds.has(relation.sourceWordId) &&
          activeListWordIds.has(relation.targetWordId),
      ),
    [activeListWordIds, allRelations],
  );

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

  const atlasWords = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return cet4Catalog.filter((item) => {
      const matchesTopic = activeTopic === "all" || item.topic === activeTopic;
      const matchesQuery =
        keyword.length === 0 ||
        item.word.toLowerCase().includes(keyword) ||
        item.meanings.some((meaning) => meaning.includes(keyword));

      return matchesTopic && matchesQuery;
    });
  }, [activeTopic, query]);

  const selectedWord =
    filteredWords.find((item) => item.id === selectedWordId) ??
    activeListWords.find((item) => item.id === selectedWordId) ??
    cet4Catalog.find((item) => item.id === selectedWordId) ??
    filteredWords[0] ??
    activeListWords[0] ??
    cet4Catalog[0];

  const selectedInList = selectedWord ? activeListWordIds.has(selectedWord.id) : false;

  const selectedRelations = useMemo(() => {
    if (!selectedWord || !selectedInList) {
      return [];
    }

    return activeListRelations
      .filter(
        (relation) =>
          relation.sourceWordId === selectedWord.id ||
          relation.targetWordId === selectedWord.id,
      )
      .sort((left, right) => right.strength - left.strength)
      .slice(0, 6);
  }, [activeListRelations, selectedInList, selectedWord]);

  const focusWords = useMemo(() => {
    if (!selectedWord) {
      return [];
    }

    if (!selectedInList) {
      return [selectedWord];
    }

    const ids = new Set([selectedWord.id]);
    selectedRelations.forEach((relation) => {
      ids.add(relation.sourceWordId);
      ids.add(relation.targetWordId);
    });

    return allWords.filter((item) => ids.has(item.id));
  }, [allWords, selectedInList, selectedRelations, selectedWord]);

  const focusNodes: Node[] = useMemo(() => {
    if (!selectedWord) {
      return [];
    }

    const neighbors = focusWords.filter((item) => item.id !== selectedWord.id);
    const centerNode: Node = {
      id: selectedWord.id,
      position: { x: 380, y: 250 },
      data: {
        label: (
          <div className="min-w-[210px] rounded-[28px] border-2 border-amber-300 bg-amber-50 px-5 py-4 text-left shadow-lg">
            <div className="text-lg font-semibold text-stone-900">{selectedWord.word}</div>
            {selectedWord.phonetic ? (
              <div className="mt-1 text-xs text-stone-500">{selectedWord.phonetic}</div>
            ) : null}
            <div className="mt-2 text-sm text-stone-600">
              {selectedWord.meanings.join(" / ")}
            </div>
          </div>
        ),
      },
      draggable: false,
      selectable: true,
      style: { background: "transparent", border: "none", width: 220 },
    };

    const orbitNodes = neighbors.map((item, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(neighbors.length, 1);
      const radius = 220;

      return {
        id: item.id,
        position: {
          x: 380 + Math.cos(angle) * radius,
          y: 250 + Math.sin(angle) * radius,
        },
        data: {
          label: (
            <div className="min-w-[150px] rounded-2xl border border-white/70 bg-white/95 px-4 py-3 text-left shadow-sm">
              <div className="text-sm font-semibold text-stone-900">{item.word}</div>
              <div className="mt-1 text-xs text-stone-500">
                {item.meanings.join(" / ")}
              </div>
            </div>
          ),
        },
        draggable: false,
        selectable: true,
        style: { background: "transparent", border: "none", width: 170 },
      } satisfies Node;
    });

    return [centerNode, ...orbitNodes];
  }, [focusWords, selectedWord]);

  const atlasNodes: Node[] = useMemo(() => {
    const topicBuckets = new Map<Topic, WordItem[]>();
    topicOrder.forEach((topic) => topicBuckets.set(topic, []));

    atlasWords.forEach((item) => {
      topicBuckets.get(item.topic)?.push(item);
    });

    return topicOrder.flatMap((topic, topicIndex) => {
      const items = topicBuckets.get(topic) ?? [];
      return items.map((item, index) => {
        const column = index % 4;
        const row = Math.floor(index / 4);
        return {
          id: item.id,
          position: {
            x: 100 + topicIndex * 290 + column * 64,
            y: 80 + row * 34,
          },
          data: {
            label: (
              <div
                className={`rounded-full px-3 py-1 text-[10px] font-medium shadow-sm ${
                  selectedWordId === item.id
                    ? "border border-amber-400 bg-amber-100 text-amber-900"
                    : "border border-white/80 bg-white/92 text-stone-700"
                }`}
              >
                {item.word}
              </div>
            ),
          },
          draggable: false,
          selectable: true,
          style: { background: "transparent", border: "none", width: 70 },
        } satisfies Node;
      });
    });
  }, [atlasWords, selectedWordId]);

  const catalogMatches = useMemo(() => {
    const keyword = libraryQuery.trim().toLowerCase();
    if (!keyword) {
      return [];
    }

    return cet4Catalog
      .filter(
        (item) =>
          item.word.toLowerCase().includes(keyword) ||
          item.meanings.some((meaning) => meaning.includes(keyword)),
      )
      .slice(0, 12);
  }, [libraryQuery]);

  const rememberedCount = activeList.wordIds.filter(
    (id) => memoryStatusMap[id] === "remembered",
  ).length;
  const learningCount = activeList.wordIds.filter(
    (id) => memoryStatusMap[id] === "learning",
  ).length;

  function updateWordStatus(wordId: string, nextStatus: MemoryStatus) {
    setMemoryStatusMap((current) => ({ ...current, [wordId]: nextStatus }));
  }

  function addWordsToList(wordIds: string[]) {
    setUserLists((current) =>
      current.map((item) =>
        item.id === activeListId
          ? { ...item, wordIds: Array.from(new Set([...item.wordIds, ...wordIds])) }
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
    setUserLists((current) => [...current, { id, name, wordIds: [] }]);
    setActiveListId(id);
    setListName("");
  }

  function importCustomWords() {
    const parsed = parseImportedWords(importText, allWords, activeListId);
    if (parsed.words.length === 0) {
      return;
    }

    setCustomWords((current) => [...current, ...parsed.words]);
    setCustomRelations((current) => [...current, ...parsed.relations]);
    addWordsToList(parsed.words.map((item) => item.id));
    setSelectedWordId(parsed.words[0].id);
    setImportText("");
  }

  function addCatalogWord(word: WordItem) {
    const existing = allWords.find(
      (item) => item.word.toLowerCase() === word.word.toLowerCase(),
    );

    if (existing) {
      addWordsToList([existing.id]);
      setSelectedWordId(existing.id);
      return;
    }

    const relations = createAutoRelations(word, allWords);
    setCustomWords((current) => [...current, word]);
    setCustomRelations((current) => [...current, ...relations]);
    addWordsToList([word.id]);
    setSelectedWordId(word.id);
  }

  return (
    <main className="min-h-screen overflow-hidden px-4 py-6 text-stone-900 md:px-8">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[380px_minmax(0,1fr)]"
      >
        <Card className="border-white/70 bg-white/70">
          <CardHeader className="space-y-4">
            <Badge className="w-fit">Nexora CET4 Atlas</Badge>
            <div className="space-y-2">
              <CardTitle className="text-2xl">Nexora 词汇学习地图</CardTitle>
              <p className="text-sm leading-6 text-stone-600">
                CET4 词库已经按语义主题分类导入。你可以搜索、加入词单，再在主图里看完整分布。
              </p>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-10"
                placeholder="搜索主图或当前词单里的单词 / 释义"
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
                    <div className="text-lg font-semibold text-amber-700">{learningCount}</div>
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
                <CardTitle className="text-base">搜索 CET4 词库</CardTitle>
                <Input
                  value={libraryQuery}
                  onChange={(event) => setLibraryQuery(event.target.value)}
                  placeholder="输入英文或中文释义，加入当前词单"
                />
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {catalogMatches.map((item) => (
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
                    <Button onClick={() => addCatalogWord(item)}>加入词单</Button>
                  </div>
                ))}
                {libraryQuery && catalogMatches.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-stone-200 p-3 text-sm text-stone-500">
                    没有找到可加入的 CET4 词。
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="bg-white/80">
              <CardHeader className="space-y-2">
                <CardTitle className="text-base">导入自定义词汇</CardTitle>
                <p className="text-xs leading-5 text-stone-500">
                  每行一个词，格式：`word | 中文1,中文2 | topic | example | memoryHint | phonetic`
                </p>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <textarea
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  className="min-h-32 w-full rounded-2xl border border-stone-300 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  placeholder="resilient | 有韧性的, 能恢复的 | emotion | She remained resilient after failure. | 把它想成会弹回来的橡皮球 | /rɪˈzɪliənt/"
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
                          <div className="flex items-center gap-3">
                            <div className="text-2xl font-semibold">{selectedWord.word}</div>
                            <Button
                              className="h-9 w-9 rounded-full px-0"
                              variant="outline"
                              onClick={() => playWordAudio(selectedWord)}
                            >
                              <Volume2 className="size-4" />
                            </Button>
                          </div>
                          {selectedWord.phonetic ? (
                            <div className="mt-2 text-sm text-stone-400">
                              {selectedWord.phonetic}
                            </div>
                          ) : null}
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
                          Example / Definition
                        </div>
                        <p>{selectedWord.example}</p>
                      </div>
                      <div>
                        <div className="mb-1 text-xs uppercase tracking-[0.16em] text-stone-400">
                          Memory Hint
                        </div>
                        <p>{selectedWord.memoryHint}</p>
                      </div>
                      {!selectedInList ? (
                        <Button onClick={() => addCatalogWord(selectedWord)}>
                          加入当前词单
                        </Button>
                      ) : null}
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
                CET4 Main Graph
              </CardTitle>
              <p className="mt-2 text-sm text-stone-600">
                `学习地图`聚焦当前词，`CET4 总图`显示完整四级词库分布，`列表`看当前词单。
              </p>
            </div>
            <Tabs
              defaultValue="focus"
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex-shrink-0"
            >
              <TabsList>
                <TabsTrigger value="focus">学习地图</TabsTrigger>
                <TabsTrigger value="atlas">CET4 总图</TabsTrigger>
                <TabsTrigger value="list">列表</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="p-0">
            <Tabs defaultValue="focus" value={activeTab} onValueChange={setActiveTab}>
              <TabsContent value="focus" className="m-0">
                <div className="h-[760px] bg-[linear-gradient(135deg,rgba(255,251,235,0.92),rgba(255,255,255,0.75))]">
                  <ReactFlow
                    fitView
                    nodes={focusNodes}
                    edges={buildRelationEdges(focusWords, selectedRelations)}
                    onNodeClick={(_, node) => setSelectedWordId(node.id)}
                    proOptions={{ hideAttribution: true }}
                    defaultEdgeOptions={{ type: "smoothstep" }}
                    nodesDraggable={false}
                  >
                    <MiniMap
                      pannable
                      zoomable
                      style={{ backgroundColor: "rgba(255,255,255,0.75)" }}
                      nodeColor={(node) => {
                        const item = focusWords.find((word) => word.id === node.id);
                        return item ? topicColorMap[item.topic] : "#a8a29e";
                      }}
                    />
                    <Controls />
                    <Background color="#d6d3d1" gap={18} size={1.2} />
                  </ReactFlow>
                </div>
              </TabsContent>
              <TabsContent value="atlas" className="m-0">
                <div className="h-[760px] bg-[linear-gradient(135deg,rgba(255,251,235,0.92),rgba(255,255,255,0.75))]">
                  <ReactFlow
                    fitView
                    nodes={atlasNodes}
                    edges={[]}
                    onNodeClick={(_, node) => setSelectedWordId(node.id)}
                    proOptions={{ hideAttribution: true }}
                    nodesDraggable={false}
                  >
                    <MiniMap
                      pannable
                      zoomable
                      style={{ backgroundColor: "rgba(255,255,255,0.75)" }}
                      nodeColor={(node) => {
                        const item = atlasWords.find((word) => word.id === node.id);
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
                        <div>
                          <div className="text-lg font-semibold">{item.word}</div>
                          {item.phonetic ? (
                            <div className="text-xs text-stone-400">{item.phonetic}</div>
                          ) : null}
                        </div>
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
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          variant="outline"
                          className="h-9 px-3"
                          onClick={(event) => {
                            event.stopPropagation();
                            playWordAudio(item);
                          }}
                        >
                          <Volume2 className="mr-2 size-4" />
                          发音
                        </Button>
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
