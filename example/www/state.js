
export function writeStateInFragment(state) {
  window.location.hash = encodeURIComponent(JSON.stringify(state));
}
export function readStateFromFragment() {
  if (window.location.hash.startsWith('#') && window.location.hash.length > 1) {
    try {
      return JSON.parse(decodeURIComponent(window.location.hash.substring(1)));
    } catch (e) {
      console.error(e);
      return null;
    }
  }
}
