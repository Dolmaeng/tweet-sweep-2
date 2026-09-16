import { defineConfig } from 'wxt';

// 문서: docs/spec/02-plan.md §1, docs/adr/0006
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  imports: false, // 자동 임포트 비활성: 의존을 명시해 core의 브라우저 무의존을 지킨다
  manifest: {
    name: 'tweet-sweep-2',
    description: '로그인 세션 안에서 내 X 게시물을 사람보다 느리게 삭제한다. 로컬 전용.',
    permissions: ['storage', 'tabs', 'scripting', 'unlimitedStorage'],
    host_permissions: ['https://x.com/*'],
    action: {}, // 아이콘 클릭 → 대시보드 탭 (background에서 처리)
  },
});
