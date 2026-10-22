// Settings shared by the content scripts. Their shadow roots are closed, so the page cannot read a translation, a
// draft or the site context in them, nor press their buttons. The dual subtitles (content/youtube.js) run on YouTube
// alone: a player built on any other page would otherwise have its text translated with the user's key, with no
// gesture, and could read the answers. The e2e tests run a copy with the roots open and their own host allowed.
Object.assign((globalThis.spotslate ??= {}), {
  SHADOW_MODE: 'closed',
  CAPTION_HOSTS: ['www.youtube.com', 'm.youtube.com', 'music.youtube.com'],
});
