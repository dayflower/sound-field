export type Language = "en" | "ja";
export type PageId = "index" | "spectrum" | "noise" | "modulate";

type TranslationValue = string | readonly string[];
type TranslationFunction = {
  invoke(...args: readonly unknown[]): TranslationValue;
}["invoke"];
type TranslationEntry =
  | TranslationValue
  | TranslationFunction
  | TranslationTable;

interface TranslationTable {
  [key: string]: TranslationEntry;
}

type PageMessages = Record<PageId, TranslationTable>;
type MessageCatalog = Record<
  Language,
  { common: TranslationTable } & PageMessages
>;

const messages: MessageCatalog = {
  en: {
    common: { languageLabel: "Language" },
    index: {
      heroTitle: "Make sound.<br /><em>See sound.</em>",
      heroLead:
        "Three ways to work with sound: shape a continuous field, inspect the frequencies in an audio file, or sculpt a sound through modulation. Everything happens in this browser.",
      utilitiesLabel: "Sound utilities",
      noiseDescription:
        "White, pink, brown: shape the energy at every frequency and design a continuous sound for your space.",
      spectrumDescription:
        "Play an audio file and observe its frequencies and levels changing in real time.",
      modulateDescription:
        "Build a browser-based FM synthesizer with four operators and eight routing algorithms.",
    },
    spectrum: {
      homeLabel: "Sound Field Utilities home",
      introTitle: "Observe the<br /><em>shape of sound.</em>",
      introLead:
        "Load an audio file to visualize the strength of its frequencies in real time. Your data never leaves this browser.",
      dropZoneLabel: "Load an audio file",
      dropTitle: "Drop an audio file here",
      dropFormat:
        "Any browser-playable format, including MP3 / WAV / M4A / OGG / FLAC",
      fileButton: "Choose audio file ＋",
      analyzerLabel: "Real-time spectrum analyzer",
      spectrumLabel: "Frequency spectrum",
      playLabel: "Play",
      pauseLabel: "Pause",
      positionLabel: "Playback position",
      noSignal: "NO SIGNAL",
      loadPrompt: "LOAD AN AUDIO FILE TO BEGIN",
      noFile: "NO FILE LOADED",
      analysisTitle: "Analysis precision and response",
      fftHint: "Frequency resolution",
      smoothingHint: "Display smoothing",
      floorHint: "Minimum displayed level",
      volumeHint: "Playback volume",
      sourceTitle: "Loaded source",
      privacy:
        "Decoding, playback, and analysis all happen on this device. Your file is never uploaded.",
      status: {
        unsupported: "UNSUPPORTED FILE",
        decoding: "DECODING SOURCE…",
        ready: "SOURCE READY",
        playbackFailed: "PLAYBACK FAILED",
        analyzing: "ANALYZING — LIVE",
        complete: "PLAYBACK COMPLETE",
        paused: "SOURCE PAUSED",
        waiting: "WAITING FOR SOURCE",
        onPlayback: "ON PLAYBACK",
        auto: "AUTO",
      },
      channels: (count: number) =>
        count === 1 ? "MONO" : `${count} CH / STEREO`,
    },
    noise: {
      homeLabel: "Sound Field Utilities home",
      heroTitle: "Design<br /><em>quiet.</em>",
      heroLead:
        "Continuous sound for focus, rest, and experimentation. Pick a color to reveal its spectrum, then shape each band for your own space.",
      start: "Play",
      stop: "Stop",
      visualLabel: "Live spectrum",
      spectrumLabel: "Frequency spectrum visualization",
      colorTitle: "Choose a noise color",
      presetLabel: "Noise type",
      importTitle: "Import a source tone",
      importDescription:
        "Analyze the average or median spectrum and apply it to the CUSTOM curve.",
      analysisLabel: "Spectrum aggregation method",
      mean: "Mean",
      median: "Median",
      chooseFile: "Choose audio file ＋",
      chooseAnotherFile: "Choose another audio file ＋",
      designTitle: "Strength by frequency",
      lowCutHint: "Cut low frequencies",
      highCutHint: "Cut high frequencies",
      editorLabel: "Spectrum editing mode",
      curveTab: "CURVE / DETAIL",
      bandTab: "10 BAND / SIMPLE",
      curveLabel: "Edit spectrum curve",
      curveHelp:
        "Drag the curve to edit its tone. The 10-band view is calculated from this curve.",
      bandHelp:
        "Moving a fader updates the interpolated curve between frequencies.",
      dataLabel: "Spectrum settings JSON",
      masterTitle: "Output level",
      safety:
        "For hearing safety, start at a low volume.<br />Avoid turning the volume up too high.",
      presets: {
        white: ["White", "Equal strength across all frequencies"],
        pink: ["Pink", "About −3 dB per octave"],
        brown: ["Brown", "Strong lows with heavily reduced highs"],
        blue: ["Blue", "About +3 dB toward the highs"],
        violet: ["Violet", "Emphasized high frequencies"],
        grey: ["Grey", "A curve designed for perceived evenness"],
        custom: ["Custom", "Your own spectrum"],
      },
      bandLevel: (frequency: string | number) => `${frequency} Hz strength`,
      tooShort: "The audio is too short to analyze.",
      noSignal: "No valid audio signal was detected.",
      copied: "COPIED ✓",
      noSource: "NO SOURCE ANALYZED",
      analyzing: "ANALYZING…",
      measuring: (name: string, mode: string) =>
        `${name} — MEASURING ${mode} SPECTRUM`,
      applied: (name: string, mode: string) =>
        `${name} — ${mode} APPLIED TO CUSTOM`,
      decoding: (name: string) => `${name} — DECODING`,
      paused: "PAUSED",
      unavailable: "AUDIO UNAVAILABLE",
    },
    modulate: {
      homeLabel: "SOUND / FIELD home",
      backLabel: "← SOUND / FIELD",
      introSynthesis: "4-OPERATOR SYNTHESIS",
      introLead: "MODULATE SOUND IN YOUR BROWSER",
      oscilloscope: "OSCILLOSCOPE",
      time: "TIME",
      spectrum: "SPECTRUM",
      frequency: "FREQUENCY",
      activeVoices: "ACTIVE VOICES",
      synthControls: "Synth controls",
      audioSuspended: "AUDIO SUSPENDED",
      audioActive: "AUDIO ACTIVE",
      master: "MASTER",
      patchJson: "PATCH JSON",
      polyphony: "8 VOICE POLYPHONIC",
      keyboard: "KEYBOARD",
      octave: "OCT",
      octaveDown: "Octave down",
      octaveUp: "Octave up",
      keyboardHint:
        "PC KEYS <kbd>A</kbd>–<kbd>K</kbd> · Click or touch to play",
      connectionPresets: "CONNECTION PRESETS",
      routing: "ROUTING",
      routingDescription:
        "Operator connections define how harmonics flow. Every operator has independent feedback.",
      operator: "OPERATOR",
      operatorName: (number: number) => `OP ${number}`,
      operatorPower: (number: number) => `Operator ${number} power`,
      waveform: "WAVEFORM",
      frequencyMode: (number: number) => `Operator ${number} frequency mode`,
      amplitudeEnvelope: "AMPLITUDE ENVELOPE",
      envelopeLabel: (number: number) =>
        `Operator ${number} amplitude envelope`,
      controls: {
        ratio: "RATIO",
        fixedHz: "FIXED",
        detune: "DETUNE",
        level: "LEVEL",
        modulationIndex: "MOD INDEX",
        feedback: "FEEDBACK",
        attack: "ATTACK",
        segment1Time: "SEGMENT 1 TIME",
        segment1Level: "SEGMENT 1 LEVEL",
        segment2Time: "SEGMENT 2 TIME",
        segment2Level: "SEGMENT 2 LEVEL",
        release: "RELEASE",
      },
      on: "ON",
      off: "OFF",
      customRouting: "CUSTOM ROUTING",
      customRoutingDiagram: "Custom routing diagram",
      footer: "POWERED BY WEB AUDIO + TONE.JS",
      importExport: "IMPORT / EXPORT",
      close: "Close",
      schemaHint: "SCHEMA VERSION 1 · CUSTOM ROUTING ALLOWED · CYCLES REJECTED",
      pasteHint: "PASTE A PATCH OR COPY THE CURRENT ONE",
      copy: "COPY",
      copied: "COPIED",
      load: "LOAD",
      loaded: "LOADED",
      patchLoaded: "PATCH LOADED",
      patchLoadFailed: "PATCH JSON could not be loaded.",
    },
  },
  ja: {
    common: { languageLabel: "言語" },
    index: {
      heroTitle: "音をつくる。<br /><em>音をみる。</em>",
      heroLead:
        "音に触れる、3つの入口。連続音を整える。手元の音源を観測する。変調によって音を形づくる。すべては、このブラウザの中で。",
      utilitiesLabel: "サウンドユーティリティ",
      noiseDescription:
        "ホワイト、ピンク、ブラウン。周波数ごとの強さを整え、自分の空間に合う連続音を設計する。",
      spectrumDescription:
        "音声ファイルを再生しながら、含まれる周波数とレベルの変化をリアルタイムで観測する。",
      modulateDescription:
        "4つのオペレーターと8種類のアルゴリズムで、ブラウザの中に自分だけのFMシンセサイザーを組み立てる。",
    },
    spectrum: {
      homeLabel: "Sound Field Utilities ホーム",
      introTitle: "音の輪郭を、<br /><em>観測する。</em>",
      introLead:
        "手元の音声ファイルを読み込むと、音に含まれる周波数の強さをリアルタイムで可視化します。データはブラウザの外へ送信されません。",
      dropZoneLabel: "音声ファイルの読み込み",
      dropTitle: "音声ファイルをここにドロップ",
      dropFormat: "MP3 / WAV / M4A / OGG / FLAC など、ブラウザが再生できる形式",
      fileButton: "ファイルを選択 ＋",
      analyzerLabel: "リアルタイムスペクトラムアナライザー",
      spectrumLabel: "周波数スペクトラム",
      playLabel: "再生",
      pauseLabel: "一時停止",
      positionLabel: "再生位置",
      noSignal: "信号なし",
      loadPrompt: "音声ファイルを読み込んで開始",
      noFile: "ファイル未選択",
      analysisTitle: "解析の精度と反応",
      fftHint: "周波数の解像度",
      smoothingHint: "表示のなめらかさ",
      floorHint: "表示する最小レベル",
      volumeHint: "再生音量",
      sourceTitle: "読み込んだ音源",
      privacy:
        "音源のデコード、再生、解析はすべてこの端末内で行われます。ファイルがアップロードされることはありません。",
      status: {
        unsupported: "未対応のファイルです",
        decoding: "音源をデコード中…",
        ready: "音源の準備完了",
        playbackFailed: "再生できませんでした",
        analyzing: "解析中 — 再生中",
        complete: "再生完了",
        paused: "一時停止中",
        waiting: "音源を待機中",
        onPlayback: "再生時に取得",
        auto: "自動",
      },
      channels: (count: number) =>
        count === 1 ? "モノラル" : `${count} チャンネル / ステレオ`,
    },
    noise: {
      homeLabel: "Sound Field Utilities ホーム",
      heroTitle: "静けさを、<br /><em>設計する。</em>",
      heroLead:
        "集中、休息、実験のための連続音。色を選ぶとスペクトルが現れる。そこから帯域ごとの強さを、あなたの空間に合わせて設計する。",
      start: "再生する",
      stop: "停止する",
      visualLabel: "リアルタイムスペクトラム",
      spectrumLabel: "周波数スペクトラムの可視化",
      colorTitle: "音の色を選ぶ",
      presetLabel: "ノイズの種類",
      importTitle: "音源の音色を取り込む",
      importDescription:
        "平均または中央値のスペクトルを解析し、CUSTOMカーブへ反映します。",
      analysisLabel: "スペクトルの集計方法",
      mean: "平均 / MEAN",
      median: "中央値 / MEDIAN",
      chooseFile: "音声ファイルを選択 ＋",
      chooseAnotherFile: "別の音声を選択 ＋",
      designTitle: "周波数ごとの強さ",
      lowCutHint: "低域をカット",
      highCutHint: "高域をカット",
      editorLabel: "スペクトラム編集モード",
      curveTab: "CURVE / 詳細",
      bandTab: "10 BAND / 簡易",
      curveLabel: "スペクトラムカーブ編集",
      curveHelp:
        "カーブをドラッグして音色を編集できます。10バンド表示はこのカーブから自動計算されます。",
      bandHelp:
        "10本のフェーダーを動かすと、周波数間を補間したカーブへ反映されます。",
      dataLabel: "スペクトラム設定のJSON",
      masterTitle: "出力レベル",
      safety:
        "聴覚保護のため、小さな音量から始めてください。<br />音量を上げすぎないようご注意ください。",
      presets: {
        white: ["ホワイト", "全帯域が同じ強さ"],
        pink: ["ピンク", "1オクターブごとに約−3 dB"],
        brown: ["ブラウン", "低域を強く、高域を大きく抑える"],
        blue: ["ブルー", "高域に向かって約＋3 dB"],
        violet: ["バイオレット", "高域を強く押し出す"],
        grey: ["グレー", "聴感上の均一さを意識したカーブ"],
        custom: ["カスタム", "自分で作るスペクトル"],
      },
      bandLevel: (frequency: string | number) => `${frequency} Hz の強さ`,
      tooShort: "音声が短すぎて解析できません。",
      noSignal: "有効な音声信号を検出できませんでした。",
      copied: "コピーしました ✓",
      noSource: "解析済みの音源はありません",
      analyzing: "解析中…",
      measuring: (name: string, mode: string) =>
        `${name} — ${mode} スペクトルを測定中`,
      applied: (name: string, mode: string) =>
        `${name} — ${mode} をCUSTOMへ適用しました`,
      decoding: (name: string) => `${name} — デコード中`,
      paused: "一時停止中",
      unavailable: "音声を利用できません",
    },
    modulate: {
      homeLabel: "SOUND / FIELD ホーム",
      backLabel: "← SOUND / FIELD",
      introSynthesis: "4オペレーター・シンセシス",
      introLead: "ブラウザで音を変調する",
      oscilloscope: "オシロスコープ",
      time: "時間",
      spectrum: "スペクトラム",
      frequency: "周波数",
      activeVoices: "発音中のボイス",
      synthControls: "シンセサイザーのコントロール",
      audioSuspended: "オーディオ停止中",
      audioActive: "オーディオ有効",
      master: "マスター",
      patchJson: "パッチJSON",
      polyphony: "8ボイス・ポリフォニック",
      keyboard: "キーボード",
      octave: "オクターブ",
      octaveDown: "オクターブを下げる",
      octaveUp: "オクターブを上げる",
      keyboardHint:
        "PCキー <kbd>A</kbd>–<kbd>K</kbd> ・クリックまたはタッチで演奏",
      connectionPresets: "接続プリセット",
      routing: "ルーティング",
      routingDescription:
        "オペレーターの接続で倍音の流れを定義します。各オペレーターには独立したフィードバックがあります。",
      operator: "オペレーター",
      operatorName: (number: number) => `OP ${number}`,
      operatorPower: (number: number) => `オペレーター ${number} の電源`,
      waveform: "波形",
      frequencyMode: (number: number) =>
        `オペレーター ${number} の周波数モード`,
      amplitudeEnvelope: "振幅エンベロープ",
      envelopeLabel: (number: number) =>
        `オペレーター ${number} の振幅エンベロープ`,
      controls: {
        ratio: "比率",
        fixedHz: "固定",
        detune: "デチューン",
        level: "レベル",
        modulationIndex: "変調指数",
        feedback: "フィードバック",
        attack: "アタック",
        segment1Time: "セグメント 1 時間",
        segment1Level: "セグメント 1 レベル",
        segment2Time: "セグメント 2 時間",
        segment2Level: "セグメント 2 レベル",
        release: "リリース",
      },
      on: "オン",
      off: "オフ",
      customRouting: "カスタムルーティング",
      customRoutingDiagram: "カスタムルーティング図",
      footer: "WEB AUDIO + TONE.JS で動作",
      importExport: "インポート / エクスポート",
      close: "閉じる",
      schemaHint:
        "スキーマ バージョン 1 ・カスタムルーティング可・循環接続は不可",
      pasteHint: "パッチを貼り付けるか、現在のパッチをコピー",
      copy: "コピー",
      copied: "コピーしました",
      load: "読み込む",
      loaded: "読み込み済み",
      patchLoaded: "パッチを読み込みました",
      patchLoadFailed: "パッチJSONを読み込めませんでした。",
    },
  },
};
const languageNames: Record<Language, string> = { en: "English", ja: "日本語" };

export function isPageId(value: string | undefined): value is PageId {
  return (
    value === "index" ||
    value === "spectrum" ||
    value === "noise" ||
    value === "modulate"
  );
}

function currentPage(): PageId {
  const value =
    typeof document === "undefined"
      ? undefined
      : document.documentElement.dataset.i18nPage;
  return isPageId(value) ? value : "index";
}

const page = currentPage();
const storedLanguage = (() => {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem("sound-field-language");
  } catch {
    return null;
  }
})();
const browserLanguage =
  typeof navigator === "undefined"
    ? "en"
    : (navigator.languages?.[0] || navigator.language || "en").toLowerCase();
const defaultLanguage: Language = browserLanguage.startsWith("ja")
  ? "ja"
  : "en";
let language: Language =
  storedLanguage === "en" || storedLanguage === "ja"
    ? storedLanguage
    : defaultLanguage;

function isTranslationTable(
  value: TranslationEntry | undefined,
): value is TranslationTable {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lookupTranslation(
  targetLanguage: Language,
  targetPage: PageId,
  key: string,
): TranslationEntry | undefined {
  const segments = key.split(".");
  const table =
    segments[0] === "common"
      ? messages[targetLanguage].common
      : messages[targetLanguage][targetPage];
  const path = segments[0] === "common" ? segments.slice(1) : segments;
  return path.reduce<TranslationEntry | undefined>((value, segment) => {
    if (!isTranslationTable(value)) return undefined;
    return value[segment];
  }, table);
}

function resolveTranslation(
  targetLanguage: Language,
  targetPage: PageId,
  key: string,
  args: readonly unknown[],
): TranslationValue | undefined {
  const value = lookupTranslation(targetLanguage, targetPage, key);
  if (typeof value === "function") return value(...args);
  return typeof value === "string" || Array.isArray(value) ? value : undefined;
}

export function translate(key: string, ...args: readonly unknown[]): string {
  const value = resolveTranslation(language, page, key, args);
  return typeof value === "string" ? value : key;
}

export function translateList(
  key: string,
  ...args: readonly unknown[]
): readonly string[] {
  const value = resolveTranslation(language, page, key, args);
  return Array.isArray(value) ? value : [];
}

export function translateFor(
  targetLanguage: Language,
  targetPage: PageId,
  key: string,
  ...args: readonly unknown[]
): string {
  const value = resolveTranslation(targetLanguage, targetPage, key, args);
  return typeof value === "string" ? value : key;
}

export function translateListFor(
  targetLanguage: Language,
  targetPage: PageId,
  key: string,
  ...args: readonly unknown[]
): readonly string[] {
  const value = resolveTranslation(targetLanguage, targetPage, key, args);
  return Array.isArray(value) ? value : [];
}

export function getLanguage(): Language {
  return language;
}

export function refreshI18n(): void {
  translatePage();
}

function translatePage(): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language;
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    const text = translate(element.dataset.i18n ?? "");
    if (element.dataset.i18nHtml !== undefined) element.innerHTML = text;
    else if (element.dataset.i18nAttr)
      element.setAttribute(element.dataset.i18nAttr, text);
    else element.textContent = text;
  });
  document
    .querySelectorAll<HTMLSelectElement>("[data-language-select]")
    .forEach((select) => {
      if (!select.options.length) {
        Object.entries(languageNames).forEach(([code, name]) => {
          select.add(new Option(name, code));
        });
      }
      select.value = language;
      select.setAttribute("aria-label", translate("common.languageLabel"));
    });
}

function setLanguage(nextLanguage: string): void {
  language = nextLanguage === "en" ? "en" : "ja";
  try {
    localStorage.setItem("sound-field-language", language);
  } catch {
    /* Storage can be unavailable in private contexts. */
  }
  translatePage();
  document.dispatchEvent(
    new CustomEvent("languagechange", { detail: { language } }),
  );
}

if (typeof document !== "undefined") {
  translatePage();
  document.addEventListener("change", (event) => {
    if (!(event.target instanceof Element)) return;
    const select = event.target.closest<HTMLSelectElement>(
      "[data-language-select]",
    );
    if (select) setLanguage(select.value);
  });
}
