/**
 * A short path through the example library. Each lesson asks for one change.
 * Running the edited program checks the printed text or a canvas color;
 * watching the original is not enough.
 */
import type { Example } from "../examples/types";
import type { Scene } from "../render/scene";

export interface LessonTask {
  /** What to change, in one sentence. */
  prompt: string;
  /** Exact program output, including the final newline print() adds. */
  stdout?: string;
  /** A color name that must show up on the canvas after the change. */
  color?: string;
}

export interface Lesson {
  id: string;
  task: LessonTask;
}

export const LESSONS: Lesson[] = [
  {
    id: "animal-hello",
    task: {
      prompt: '把第一行改成 print("小鸭说：嘎！")，再运行。',
      stdout: "小鸭说：嘎！\n小狗说：汪！\n小鸡说：叽叽叽！\n你好呀！\n",
    },
  },
  {
    id: "pencils",
    task: {
      prompt: "把铅笔改成 6 支，再运行。",
      stdout: "铅笔有 6 支\n橡皮有 2 块\n加在一起是 8\n",
    },
  },
  {
    id: "umbrella",
    task: {
      prompt: '把带伞那句改成 print("带上雨伞，雨天也出去玩")，运行时输入「雨」。',
      stdout: "今天是晴还是雨？带上雨伞，雨天也出去玩\n",
    },
  },
  {
    id: "count-sheep",
    task: {
      prompt: "把 5 改成 3，只数三只绵羊。",
      stdout: "第 1 只绵羊，睡着了\n第 2 只绵羊，睡着了\n第 3 只绵羊，睡着了\nzzzz\n",
    },
  },
  {
    id: "stairs",
    task: {
      prompt: '把海龟的颜色改成 "red"，再运行。',
      color: "red",
    },
  },
  {
    id: "triangle",
    task: {
      prompt: '把填充颜色从 "violet" 改成 "gold"，再运行。',
      color: "gold",
    },
  },
  {
    id: "print-triangle",
    task: {
      prompt: "把 rows 改成 3，画出三行星。",
      stdout: "  *\n ***\n*****\n",
    },
  },
  {
    id: "star",
    task: {
      prompt: '把填充颜色从 "yellow" 改成 "gold"，再运行。',
      color: "gold",
    },
  },
  {
    id: "countdown",
    task: {
      prompt: "把倒计时改成从 3 开始：range(3, 0, -1)，再运行。",
      stdout: "3\n2\n1\n发射！🚀\n",
    },
  },
  {
    id: "star-function",
    task: {
      prompt: '把第一颗星星的颜色从 "gold" 改成 "pink"，再运行。',
      color: "pink",
    },
  },
  {
    id: "shopping",
    task: {
      prompt: '在去掉牛奶之后加一行 items.append("饼干")，再运行。',
      stdout: "别忘了买面包！\n1 鸡蛋\n2 苹果\n3 面包\n4 饼干\n一共 4 样\n",
    },
  },
  {
    id: "grade",
    task: {
      prompt: '把 A 的那句改成 print("A，超级！")，运行时输入 95。',
      stdout: "考了多少分？A，超级！\n",
    },
  },
];

const BY_ID = new Map(LESSONS.map((lesson) => [lesson.id, lesson]));

export function lessonById(id: string): Lesson | undefined {
  return BY_ID.get(id);
}

export function lessonIndex(id: string): number {
  return LESSONS.findIndex((lesson) => lesson.id === id);
}

/** The example a brand-new project starts from: lesson 1. */
export function firstLessonExample(byId: Map<string, Example>): Example {
  const example = byId.get(LESSONS[0]?.id ?? "");
  if (!example) throw new Error("lesson 1 is missing from the example library");
  return example;
}

export function nextLesson(done: ReadonlySet<string>): Lesson | undefined {
  return LESSONS.find((lesson) => !done.has(lesson.id));
}

function sceneUsesColor(scene: Scene, name: string): boolean {
  const want = name.toLowerCase();
  for (const item of scene.items.values()) {
    if (item.opts.fill?.toLowerCase() === want || item.opts.outline?.toLowerCase() === want) return true;
  }
  return false;
}

/** True when this run matches the lesson's one change. */
export function taskPassed(task: LessonTask, stdout: string, scene: Scene): boolean {
  if (task.stdout !== undefined && stdout !== task.stdout) return false;
  if (task.color !== undefined && !sceneUsesColor(scene, task.color)) return false;
  return task.stdout !== undefined || task.color !== undefined;
}

/** Spaces become middle dots so two lines that differ only by spacing stay readable. */
function visible(line: string): string {
  return line.replaceAll(" ", "·");
}

/** One sentence a child can use after a run that did not match. */
export function taskMiss(task: LessonTask, stdout: string, scene: Scene): string {
  if (task.stdout !== undefined && stdout !== task.stdout) {
    const want = task.stdout.replace(/\n$/, "").split("\n");
    const got = stdout.replace(/\n$/, "").split("\n");
    const n = Math.max(want.length, got.length);
    for (let i = 0; i < n; i++) {
      if (want[i] === got[i]) continue;
      const line = i + 1;
      const actual = got[i] === undefined ? "" : visible(got[i]);
      const expected = want[i] === undefined ? "" : visible(want[i]);
      if (got[i] === undefined) return `还没对上。第 ${line} 行还没出现「${expected}」。`;
      if (want[i] === undefined) return `还没对上。第 ${line} 行多出来了「${actual}」。`;
      return `还没对上。第 ${line} 行现在是「${actual}」，要改成「${expected}」。`;
    }
  }
  if (task.color !== undefined && !sceneUsesColor(scene, task.color)) {
    return `还没对上。画面上还没有 ${task.color}。`;
  }
  return "还没对上，再改改";
}
