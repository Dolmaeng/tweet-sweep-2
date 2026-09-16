import { defineContentScript } from 'wxt/utils/define-content-script';

// x.com 콘텐츠 스크립트. M2에서 실행기 명령을 받는다. M1에서는 아무 것도 하지 않는다(P2: 불필요한 동작 0).
export default defineContentScript({
  matches: ['https://x.com/*'],
  runAt: 'document_idle',
  main() {
    // intentionally empty until M2 (T11)
  },
});
