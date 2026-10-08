// Shared wiring for whichever chat surface is mounted: load the project's timeline, open a
// QuestionStub on every gap click, answer the node pane's 'uip:ask'.
import { onBeforeUnmount, watch } from 'vue';
import { useGraphApi } from './graphApi';
import { useChat } from './store';
import { useTimeline } from '../agents/timeline';

export function useChatBoot(onGap?: () => void, onAsk?: () => void) {
  const g = useGraphApi(); const chat = useChat(); const tl = useTimeline();
  watch(() => g.project.value?.id, (id) => { if (id) tl.load(id); }, { immediate: true });
  const off = g.onGap((gap) => { chat.openStub(gap); onGap?.(); });
  // node pane "Ask about this" (WP1): window CustomEvent 'uip:ask' { nodeId }
  const ask = (e: Event) => {
    const id = (e as CustomEvent<{ nodeId?: string }>).detail?.nodeId;
    if (!id) return;
    onAsk?.();
    chat.askAbout(id);
  };
  window.addEventListener('uip:ask', ask);
  onBeforeUnmount(() => { off(); window.removeEventListener('uip:ask', ask); });
  return { g, chat, tl };
}
