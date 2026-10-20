// Types for reading SpotSlate in an editor: nothing here runs, and nothing is built from it. They are checked against
// the code with `npm run types` (jsconfig.json, `checkJs`). See ARCHITECTURE.md for how the parts fit together.
//
// The modules in extension/lib/ need no help: they import each other, so the editor follows them. What it cannot
// follow is described here:
//
// - the content scripts, classic scripts that share one object, `globalThis.spotslate` (interface `SpotSlate`);
// - the messages and ports between the page, the extension pages and background (`SpotSlate.Message` and others);
// - what is kept in `chrome.storage` (at the end of this file).
//
// Types are in the namespace `SpotSlate`, so they do not clash with the DOM's (`Highlight`, `Selection`):
// `SpotSlate.Settings`, `SpotSlate.Popup`.

declare namespace SpotSlate {
  // Settings (lib/settings.js, lib/keys.js, lib/sites.js)

  /** A two-letter language code from `LANGUAGES` in lib/settings.js: 'ru', 'en', 'de', ... */
  type Lang = string;
  /** A site: the host with port of a page, such as 'en.wikipedia.org' or 'localhost:8080'. */
  type Site = string;
  /** Who translates: an AI provider called by background, or Chrome's translator on the page itself. */
  type Engine = 'api' | 'browser';
  /** A companion in the settings: a key of `heroes`, or none. */
  type Companion = 'pup' | 'cat' | 'corgi' | 'monkey' | 'none';

  /** A shortcut by its modifiers and its physical key (KeyA..KeyZ, Digit0..Digit9), so it works in any layout. */
  interface Shortcut {
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    meta: boolean;
    code: string;
  }

  interface Keys {
    /** The key held to read. */
    read: 'Alt' | 'Control';
    /** The shortcut that opens the compose window. */
    write: Shortcut;
    /** The shortcut that saves the selected word to the vocabulary. */
    vocabulary: Shortcut;
  }

  /** What the user filled in for a provider; blank model and URL mean the provider's defaults. */
  interface ProviderEntry {
    apiKey: string;
    model: string;
    baseUrl: string;
  }

  /** The settings with every value checked (`withDefaults`), under `settings` in chrome.storage.local. */
  interface Settings {
    /** A key of `PROVIDERS` in lib/providers.js; 'chrome' is Chrome's translator. */
    provider: string;
    targetLang: Lang;
    providers: Record<string, ProviderEntry>;
    keys: Keys;
    companion: Companion;
    /** The learning mode: a grammar breakdown with the translation, and the vocabulary. */
    learning: boolean;
    /** What the learning breakdown should hold: the user's own instruction, or the default. */
    learningPrompt: string;
    /** What each correction note should hold in the learning mode: the user's own instruction, or the default. */
    correctionPrompt: string;
  }

  /** A preset of lib/providers.js, by its id in `PROVIDERS`. */
  interface ProviderPreset {
    name: string;
    group: 'free' | 'cloud' | 'local' | 'other';
    api: 'browser' | 'openai' | 'anthropic';
    baseUrl: string;
    model: string;
    models: string[];
    keyRequired: boolean;
    keyUrl?: string;
    hint?: string;
    /** Request fields that turn reasoning off. */
    extras: Record<string, unknown>;
    temperature?: { translate: number; notes: number };
    headers?: Record<string, string>;
    maxTokensField?: string;
  }

  /** The provider in use with its key, model and URL, defaults filled in (`activeProvider`). */
  interface Provider extends ProviderPreset {
    id: string;
    apiKey: string;
  }

  /** What the user chose for one site in the toolbar window (lib/sites.js). All false is the default. */
  interface SiteMode {
    /** SpotSlate does nothing on the site. */
    off: boolean;
    /** Chrome's translator only: nothing is sent. */
    local: boolean;
    /** No site context is learned, sent or shown. */
    noContext: boolean;
  }

  /** The public part of the settings, the only part pages get (background `pageSettings()`). */
  interface PageSettings {
    targetLang: Lang;
    engine: Engine;
    providerName: string;
    keys: Keys & { readName: string };
    /** The codes of `LANGUAGES`, in order, for the language pickers. */
    languages: Lang[];
    companion: Companion;
    /** The learning mode: a breakdown with a word or a sentence the user selects. */
    learning: boolean;
  }

  /** An error as background words it (lib/errors.js): `code` such as 'no_key', 'auth', 'engine_changed'. */
  interface ApiError {
    code: string;
    message: string;
  }

  /** The site context as background tells it: '' for none; `updating` while the AI rewrites it. */
  interface Notes {
    site: Site | null;
    text: string;
    updating: boolean;
  }

  /** The form of options.html, by the names of its fields. */
  interface SettingsForm extends HTMLFormElement {
    readonly elements: HTMLFormControlsCollection & {
      targetLang: HTMLSelectElement;
      provider: HTMLSelectElement;
      apiKey: HTMLInputElement;
      model: HTMLInputElement;
      baseUrl: HTMLInputElement;
      readKey: HTMLSelectElement;
      writeKey: HTMLInputElement;
      vocabularyKey: HTMLInputElement;
      companion: RadioNodeList;
      learning: HTMLInputElement;
      learningPrompt: HTMLTextAreaElement;
      correctionPrompt: HTMLTextAreaElement;
    };
  }

  /** The model list of options.html: its items are the models. */
  interface ModelList extends HTMLUListElement {
    readonly children: HTMLCollectionOf<HTMLLIElement>;
  }

  /** What the compose window opens with, from background (`composeState()`). */
  interface ComposeState {
    /** `LANGUAGES`: code to English name. */
    languages: Record<Lang, string>;
    /** The user's own language, which the window speaks. */
    from: Lang;
    /** The language the user writes in; their own unless chosen otherwise for the site. */
    source: Lang;
    /** The language to write in; the same as `source` means "check my writing". */
    to: Lang;
    engine: Engine;
    /** Whether the settings name an AI provider (the site may still be kept to Chrome's translator). */
    aiProvider: boolean;
    providerName: string;
    site: Site | null;
    siteMode: SiteMode;
    notes: string;
    /** The last draft written on the site, from chrome.storage.session. */
    draft: string;
  }

  // Messages
  //
  // chrome.runtime.sendMessage goes to background (and to open extension pages); chrome.tabs.sendMessage to one tab.
  // A content script never names its site: background takes it from the tab (`siteOf`). Extension pages, which are
  // on no site, name the active tab's site in `site`.

  /** To background with chrome.runtime.sendMessage, handled in background.js `onMessage`. */
  type Message =
    /** Opens the settings page. From the popup's gear and the compose window's. */
    | { type: 'open-options' }
    /** Answered with `PageSettings & { siteMode }`. From content/main.js on load. */
    | { type: 'page-settings' }
    /** Answered with the site's `SiteMode`. Nothing sends it any more: compose-open answers the mode too. */
    | { type: 'site-mode'; site?: Site }
    /** Saves a site's mode, only from extension pages (toolbar window, settings); answered with the mode stored. */
    | { type: 'set-site-mode'; site?: Site; mode: SiteMode }
    /** Answered with `Notes`. From the context panel. */
    | { type: 'notes'; site?: Site }
    /** Forgets the site's context. From the context panel's Clear. */
    | { type: 'clear-notes'; site?: Site }
    /** A YouTube video's subtitle context, by id; answered with `{ text }`. From content/main.js when captions run. */
    | { type: 'video-context'; videoId: string; meta: VideoMeta; lines: string[] }
    /** Save a selected word to the vocabulary, under its language. From content/main.js on Alt+A; answered with `{ added, word?, lang? }`. */
    | { type: 'add-word'; word: string; lang: string }
    /** Answered with the whole vocabulary `{ [lang]: [{ word, date }] }`. From the vocabulary view. */
    | { type: 'vocabulary' }
    /** Remove a word from the vocabulary, only from extension pages; answered with the vocabulary after. */
    | { type: 'remove-word'; lang: string; word: string }
    /** Opens a GitHub issue with the setup and the user's comment (never the text). From the popup or the composer. */
    | { type: 'report'; mode: 'text' | 'dictionary' | 'compose' | 'correction'; comment?: string }
    /** The language of a text Chrome's translator translated on the page, counted for the compose window. */
    | { type: 'read-lang'; lang: Lang | null }
    /** Answered with `ComposeState`. From the compose window on a page and the toolbar window. */
    | { type: 'compose-open'; site?: Site | null; pageLang: string | null }
    /** The language chosen to write in, remembered for the site. */
    | { type: 'compose-target'; site?: Site; lang: Lang }
    /** The language chosen to write from, remembered for the site. */
    | { type: 'compose-source'; site?: Site; lang: Lang }
    /** The draft, kept for the site in chrome.storage.session; '' forgets it. */
    | { type: 'compose-draft'; site?: Site; draft: string }
    /** The language to translate into, chosen in a popup's title bar: the same setting as on the settings page. */
    | { type: 'set-target-lang'; lang: Lang };

  /** From background (or the toolbar window) to pages and extension pages. */
  type Broadcast =
    /** To every tab after the settings change. */
    | ({ type: 'settings-changed' } & PageSettings)
    /** To the site's tabs and to extension pages after a mode is saved. */
    | { type: 'site-mode-changed'; site: Site; siteMode: SiteMode }
    /** To the site's tabs and to extension pages while and after the context is rewritten. */
    | ({ type: 'notes-changed' } & Notes)
    /** From the toolbar window to the active tab, answered with `{ pageLang }` (its `<html lang>`). */
    | { type: 'compose-context' };

  /** Port 'translate': content/main.js asks background to translate one text with the AI provider. */
  interface TranslateRequest {
    text: string;
    /** 'dictionary' for a selection of one to three words: a short dictionary entry. */
    mode: 'text' | 'dictionary';
    /** The words around a selected phrase, for a dictionary entry. */
    context: string;
    /** A YouTube video id for a caption line: background uses that video's subtitle context, not the site notes. */
    videoId?: string;
    /** Add a grammar breakdown: the learning mode, for a selected word or sentence. */
    learning: boolean;
    /** What the breakdown holds; set by background from the settings, never by the page. */
    learningPrompt?: string;
    /** The text's language, if the detector looked at it. */
    lang: Lang | null;
  }

  /** Port 'compose': the compose window asks background to write, check or correct a draft. */
  interface ComposeRequest {
    text: string;
    from: Lang;
    to: Lang;
    /** 'write' into `to`; 'check' it back into the user's own language; 'correct' the user's own writing; 'rephrase' the finished translation in `to`. */
    purpose: 'write' | 'check' | 'correct' | 'rephrase';
    /** For 'rephrase': a preset key of `REPHRASE_STYLES` or the user's own short instruction. */
    instruction?: string;
    site?: Site | null;
  }

  /** What background answers on either port: chunks of the answer as it streams, then done or an error. */
  type PortAnswer = { type: 'chunk'; text: string } | { type: 'done' } | ({ type: 'error' } & ApiError);

  // Content scripts

  /** What the read key would act on: a block, a selected range or a field, with its text or why it cannot be read. */
  interface Picked {
    target: Element | Range;
    text?: string;
    /** 'editable' for a form field, 'too-long' past 3000 characters. */
    reason?: 'editable' | 'too-long';
    /** The user's own selection. */
    selection?: boolean;
    /** A selection inside a text field. */
    field?: boolean;
  }

  /** One guess of Chrome's LanguageDetector. */
  interface DetectedLanguage {
    detectedLanguage: string;
    confidence: number;
  }

  /** What went wrong with Chrome's translator. */
  type BrowserProblem = 'unsupported' | 'unknown_language' | 'unavailable' | 'needs_download' | 'failed';

  type BrowserTranslation = { text: string; source: Lang } | { text?: undefined; problem: BrowserProblem; source?: Lang; detail?: string };

  /** A problem in words, and the button that helps. */
  interface ProblemText {
    message: string;
    action: 'download' | 'settings' | 'retry' | null;
  }

  /** One part of a corrected text: what stayed, what was removed and what was added. */
  interface WordChange {
    type: 'same' | 'removed' | 'added';
    text: string;
  }

  interface PopupOptions {
    onOpenSettings(): void;
    onRetry(): void;
    onDownload(): void;
    onClose(): void;
    /** A bad translation reported; gets the popup's text. */
    onReport(translation: string): void;
    /** Another language to translate into, chosen in the title bar. */
    onTargetChange(lang: Lang): void;
  }

  /** The translation popup (content/popup.js), in its own closed shadow root, on the paragraph it translates. */
  interface Popup {
    open(target: Element | Range): void;
    /** `text` says what is going on, such as a download; the default is an ellipsis. */
    setLoading(text?: string): void;
    setText(text: string): void;
    /** A line instead of a translation, such as "already in your language". */
    setNotice(text: string): void;
    setError(message: string, options?: { action?: ProblemText['action'] }): void;
    writeClipboard(text: string): Promise<void>;
    /** Everything the popup says is in `lang`; its title bar picks from `languages`. */
    setLanguage(lang: Lang, languages?: Lang[] | null): void;
    isPickerOpen(): boolean;
    /** With an AI provider the footer offers the site context. */
    setContext(available: boolean, providerName?: string): void;
    /** Keeps the popup by its paragraph while something scrolls. */
    follow(): void;
    /** Keeps a dragged popup inside the window. */
    keepInView(): void;
    close(): void;
    isOpen(): boolean;
    isPinned(): boolean;
    isLoading(): boolean;
    /** Dragged or resized: it stays put on screen. */
    isDetached(): boolean;
    getBlock(): Element | Range | null;
    /** The popup with the context panel under it, when that is open. */
    getRect(): DOMRect;
    /** Whether a node, or an event's target, is part of the popup. */
    isOwn(node: any): boolean;
  }

  /** The outline over what the read key points at, and the dashed line to the open popup (content/highlight.js). */
  interface PageOutline {
    show(target: Element | Range, options?: { muted?: boolean; hint?: string; linked?: boolean }): void;
    hide(): void;
    anchor(target: Element | Range, popupRect: () => DOMRect): void;
    release(): void;
  }

  interface LanguagePickerOptions {
    className: string;
    codes: Lang[];
    value: Lang;
    label(): string;
    titleOf(code: Lang): string;
    onChange?(code: Lang): void;
    onOpen?(): void;
  }

  /** A language button with its list, in every title row (content/lang-picker.js). */
  interface LanguagePicker {
    element: HTMLElement;
    readonly value: Lang;
    setValue(code: Lang, languages?: Lang[] | null): void;
    refresh(): void;
    isOpen(): boolean;
    close(): void;
  }

  /** The site context panel under the popup or the compose window (content/notes-panel.js). */
  interface NotesPanel {
    element: HTMLElement;
    isOpen(): boolean;
    setOpen(open: boolean): void;
    setLanguage(lang: Lang): void;
    setProvider(name: string): void;
    destroy(): void;
  }

  interface ComposerOptions extends Partial<ComposeState> {
    container: HTMLElement | ShadowRoot;
    /** Where its styles go: a shadow root or the document. */
    styleRoot: ShadowRoot | Document;
    languages: Record<Lang, string>;
    from: Lang;
    to: Lang;
    engine: Engine;
    notesContainer?: HTMLElement | ShadowRoot;
    showSettings?: boolean;
    /** Shows a button that opens SpotSlate's PDF reader (the toolbar popup only). */
    showPdf?: boolean;
    showClose?: boolean;
    /** Shows the grip of a window that can be moved by its title row. */
    draggable?: boolean;
    onSourceChange?(lang: Lang): void;
    onTargetChange?(lang: Lang): void;
    onDraftChange?(draft: string): void;
    /** The result was copied; gets it. */
    onCopied?(text: string): void;
    onClose?(): void;
    onOpenSettings?(): void;
    onOpenPdf?(): void;
    /** The user reports a bad result; `mode` says what it was, `comment` is their own note. */
    onReport?(report: { comment: string; mode: 'compose' | 'correction' }): void;
  }

  /** The compose window's content (content/composer.js): used on pages and in the toolbar window. */
  interface Composer {
    element: HTMLElement;
    focus(): void;
    close(): void;
    keepDraft(): void;
    destroy(): void;
  }

  /** Where the compose window opens: at a field, or below a point (the mouse), giving the focus back to `returnTo`. */
  type ComposeAnchor = { field: HTMLElement; point?: undefined; returnTo?: Element | null } | { field?: undefined; point: { x: number; y: number } | null; returnTo?: Element | null };

  /** The compose window on a page (content/compose-window.js). */
  interface ComposeWindow {
    open(anchor: ComposeAnchor, options: Omit<ComposerOptions, 'container' | 'styleRoot'>): void;
    close(): void;
    /** Closes it as its × does. */
    dismiss(): void;
    /** Closes it after a click elsewhere, keeping the draft. */
    leave(): void;
    isOpen(): boolean;
    /** Whether a node, or an event's target, is part of the window. */
    isOwn(node: any): boolean;
  }

  /** A part of a frame: rows of cells, '.' transparent, any other character a color of the palette. */
  type Part = string[];

  /** A companion's frames and colors (content/pup.js, cat.js, corgi.js). */
  interface Hero {
    name: string;
    width: number;
    height: number;
    palette: Record<string, string>;
    /** Loops: 'dance' (waiting) and 'idle' (resting), and the fidgets. */
    animations: Record<string, { fps: number; frames: Part[] }>;
    /** Animations played once now and then while resting. */
    fidgets?: string[];
  }

  /** Where a companion should be on this frame: by the mouse, on the edge of a rect, or nowhere. */
  type HeroSpot =
    | null
    | { mouse: { x: number; y: number }; perch?: undefined; mood: string }
    | { perch: DOMRect; mouse?: undefined; mood: string };

  /** A hero drawn into a host (content/hero.js `drawHero`). */
  interface DrawnHero {
    setMood(mood: string): void;
    stop(): void;
  }

  /** The companion on a page (content/hero.js `createHero`). */
  interface CompanionOnPage {
    /** Call when it may have somewhere to be; it then follows `spot()` until that says nowhere. */
    wake(): void;
    hide(): void;
  }

  /** A watched YouTube video's metadata, read from the page DOM, that its subtitle context is distilled from. */
  interface VideoMeta {
    title: string;
    channel: string;
    description: string;
  }

  /** A brief confirmation toast (content/toast.js `createToast`). */
  interface Toast {
    show(text: string): void;
    /** The companion tosses the saved word up and away from `origin` into the vocabulary (skipped with reduced motion). */
    toss(text: string, origin: { x: number; y: number } | null): void;
  }

  /** A caption cue from the timedtext timeline (content/youtube.js `parseTimedText`): a line and when it shows. */
  interface Cue {
    start: number;
    end: number;
    text: string;
  }

  /** Dual subtitles on YouTube (content/youtube.js `createCaptions`). */
  interface Captions {
    /**
     * Starts (or re-targets) watching the player; `translate(text)` resolves with the line's translation, `onCue(text)`
     * (optional) is told each new cue so main.js can build the video's context, and `videoId` (optional) resets the
     * look-ahead timeline when the video changes.
     */
    start(options: { translate: (text: string) => Promise<string>; targetLang: Lang; onCue?: (text: string) => void; videoId?: string }): void;
    stop(): void;
  }
}

/**
 * What the content scripts share: each file adds its part to `globalThis.spotslate` when it runs, in the order of
 * `content_scripts` in manifest.json (welcome.html and options.html load some of them in the same order).
 */
interface SpotSlate {
  /** content/config.js: 'closed' in the extension; the e2e tests run a copy with 'open'. */
  SHADOW_MODE: ShadowRootMode;

  /** content/strings.js: what SpotSlate says, per language and key. */
  STRINGS: Record<SpotSlate.Lang, Record<string, string>>;
  /** content/strings.js: `lang`'s text for `key`, its {placeholders} filled; English when missing. */
  t(lang: SpotSlate.Lang, key: string, params?: Record<string, string | number>): string;
  /** content/strings.js: a language's name in the language `ui`. */
  languageName(code: string, ui: SpotSlate.Lang, options?: { capitalized?: boolean }): string;

  /** content/block.js: the element under a point, inside open shadow roots too. */
  elementAt(x: number, y: number): Element | null;
  /** content/block.js: the readable block around a node, or why it cannot be read; null for nothing to read. */
  inspectBlock(start: Node | null): SpotSlate.Picked | null;
  /** content/youtube.js: on YouTube, mark the caption cue around the element as one block (a no-op elsewhere). */
  markCaptionBlock(element: Element | null): void;
  /** content/block.js: whether the point is over a line of text rather than padding. */
  isOverText(x: number, y: number): boolean;
  /** content/block.js: a textarea or a text or search input, never a password, one-time code or card field. */
  isTextField(field: unknown): field is HTMLInputElement | HTMLTextAreaElement;
  /** content/block.js: the field to write in around a node or an event's target (a text field or a whole rich text editor), or null. */
  writableField(start: any): HTMLElement | null;

  /** content/selection.js: the user's selection under a point, on the page or in the focused field. */
  selectionAt(x: number, y: number): SpotSlate.Picked | null;
  /** content/selection.js: a word or a few, worth a dictionary entry. */
  isShortPhrase(text: string): boolean;
  /** content/selection.js: the phrase at [start, end) with a few words around it from its sentence. */
  wordsAround(source: string, start: number, end: number): string;
  /** content/selection.js: the whole text of the block a selection is in; '' when it spans blocks. */
  blockTextOf(range: Range): string;
  /** content/selection.js: the words around a selected phrase. */
  contextOf(range: Range): string;

  /** content/language.js: whether the detector is sure the text is in `targetLang`. */
  isAlreadyIn(results: SpotSlate.DetectedLanguage[] | null, targetLang: SpotSlate.Lang): boolean;
  /** content/language.js: Chrome's guesses for the text, best first; null without a detector. */
  detectLanguage(text: string): Promise<SpotSlate.DetectedLanguage[] | null>;
  /** content/language.js: what the detector already said about the text, without asking again. */
  detectedBefore(text: string): SpotSlate.DetectedLanguage[] | null;
  alreadyInLanguage(text: string, targetLang: SpotSlate.Lang): Promise<boolean>;

  /** content/translator.js: a language tag as a code Chrome's Translator accepts; null for none. */
  languageCode(tag: unknown): string | null;
  /** content/translator.js: the detector's top guess when it is confident enough. */
  sourceLanguage(results: SpotSlate.DetectedLanguage[] | null): string | null;
  /** content/translator.js: translates with Chrome's translator, on this computer. */
  translateInBrowser(
    text: string,
    targetLang: SpotSlate.Lang,
    options?: { sourceLang?: string; sample?: string; fallbackLang?: string; onProgress?(share: number): void },
  ): Promise<SpotSlate.BrowserTranslation>;
  /** content/translator.js: gets a language pair ready ahead; null when ready. */
  prepareInBrowser(source: string, targetLang: SpotSlate.Lang, options?: { onProgress?(share: number): void }): Promise<SpotSlate.BrowserProblem | null>;
  /** content/translator.js: a problem of Chrome's translator in words, worded in `ui`. */
  describeProblem(result: { problem?: SpotSlate.BrowserProblem; source?: string; detail?: string }, targetLang: SpotSlate.Lang, ui?: SpotSlate.Lang): SpotSlate.ProblemText;
  forgetTranslators(): void;

  /** content/notes-panel.js */
  createNotesPanel(options?: { site?: SpotSlate.Site | null; providerName?: string; lang?: SpotSlate.Lang }): SpotSlate.NotesPanel;
  NOTES_CSS: string;
  /** content/lang-picker.js */
  createLanguagePicker(options: SpotSlate.LanguagePickerOptions): SpotSlate.LanguagePicker;
  PICKER_CSS: string;
  /** content/popup.js */
  createPopup(options: SpotSlate.PopupOptions): SpotSlate.Popup;
  /** content/popup.js: the six dots on windows that can be moved. */
  createGrip(): HTMLElement;
  /** content/highlight.js */
  createHighlight(): SpotSlate.PageOutline;
  /** content/correction.js: the AI's answer read into the corrected text and its notes. */
  parseCorrection(answer: string): { corrected: string; notes: string[] };
  /** content/correction.js: what changed, word by word. */
  diffWords(before: string, after: string): SpotSlate.WordChange[];
  /** content/composer.js */
  createComposer(options: SpotSlate.ComposerOptions): SpotSlate.Composer;
  /** content/compose-window.js */
  createComposeWindow(): SpotSlate.ComposeWindow;

  /** content/pixels.js: drawing the companions from parts. */
  pixels: {
    drawFrame(width: number, height: number, layers: [SpotSlate.Part, number, number][]): SpotSlate.Part;
    mirror(part: SpotSlate.Part): SpotSlate.Part;
    withRows(part: SpotSlate.Part, rows: Record<number, string>): SpotSlate.Part;
  };
  /** content/pup.js, cat.js, corgi.js: the companions by their key in the settings. */
  heroes: Record<Exclude<SpotSlate.Companion, 'none'>, SpotSlate.Hero>;
  /** content/hero.js: a hero drawn into a closed shadow root of `host`. */
  drawHero(hero: SpotSlate.Hero, host: HTMLElement, options?: { scale?: number }): SpotSlate.DrawnHero;
  /** content/hero.js: the companion by the mouse and on the popup; `spot()` says where it should be. */
  createHero(hero: SpotSlate.Hero, spot: () => SpotSlate.HeroSpot): SpotSlate.CompanionOnPage;
  /** content/youtube.js: dual subtitles on YouTube (a translation line above the native caption). */
  createCaptions(): SpotSlate.Captions;
  /** content/toast.js: a brief confirmation at the bottom of the page (Alt+A saved a word). */
  createToast(): SpotSlate.Toast;
  /** content/youtube.js: parse a timedtext json3 body into the cue timeline (for look-ahead). */
  parseTimedText(json: string): SpotSlate.Cue[];
}

// Each content script adds its part when it runs, so the members are there only after their script.
declare var spotslate: Partial<SpotSlate>;

// Chrome's built-in AI, which TypeScript's DOM types do not have yet: only what SpotSlate uses.
interface AIDownloadMonitor extends EventTarget {}
type AIAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';
declare var LanguageDetector: {
  availability(): Promise<AIAvailability>;
  create(): Promise<{ detect(text: string): Promise<SpotSlate.DetectedLanguage[]> }>;
};
declare var Translator: {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<AIAvailability>;
  create(options: { sourceLanguage: string; targetLanguage: string; monitor?(monitor: AIDownloadMonitor): void }): Promise<{ translate(text: string): Promise<string> }>;
};
interface Navigator {
  userAgentData?: { platform: string };
}

// What is kept in chrome.storage. `get` here reads the keys below; the rest of the chrome types stay as they are.
declare namespace chrome.storage {
  /** chrome.storage.local: kept until SpotSlate is removed; only extension pages and background may read it. */
  interface LocalItems {
    /** Read through `loadSettings()` (lib/settings.js), which checks every value. */
    settings?: Partial<SpotSlate.Settings> & Record<string, unknown>;
    /** Sites with a mode of their own; the default mode is not kept. */
    sites?: Record<SpotSlate.Site, Partial<SpotSlate.SiteMode>>;
    /** The compose window's languages: per site, and the last one chosen to write in. */
    compose?: { targets?: Record<SpotSlate.Site, SpotSlate.Lang>; sources?: Record<SpotSlate.Site, SpotSlate.Lang>; last?: SpotSlate.Lang };
    /** Words saved with Alt+A, by language (lib/vocabulary.js). */
    vocabulary?: Record<string, { word: string; date: number }[]>;
  }

  /** chrome.storage.session: kept until the browser closes. */
  interface SessionItems {
    /** The site context. */
    [key: `notes:${string}`]: string;
    /** How many texts were read on the site in each language, for the compose window. */
    [key: `langs:${string}`]: Record<SpotSlate.Lang, number>;
    /** The last draft written on the site ('draft:' off any site). */
    [key: `draft:${string}`]: string;
    /** A translation, by a hash of the provider, model, language, mode, text and context. */
    [key: `cache:${string}`]: string;
  }

  interface LocalStorageArea {
    get(keys?: keyof LocalItems | (keyof LocalItems)[] | null): Promise<LocalItems>;
  }

  interface SessionStorageArea {
    // The keys are built at run time ('notes:' + site), so a read by such a key is `any`.
    get(keys?: string | string[] | null): Promise<SessionItems & Record<string, any>>;
  }
}
