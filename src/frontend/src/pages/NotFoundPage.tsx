import { Link } from "react-router-dom";

import { useDocumentTitle } from "../ui/useDocumentTitle";

/**
 * Anything outside the four real routes (UIX-006). Without this an unknown
 * path renders the shell with an empty body, which reads as a broken app
 * rather than a wrong address.
 */
export function NotFoundPage() {
  useDocumentTitle("찾을 수 없는 주소");
  return (
    <main>
      <section className="empty-state" data-testid="not-found">
        <h1>주소를 찾을 수 없습니다</h1>
        <p>요청한 주소에 해당하는 화면이 없습니다. 아래에서 이어서 진행하세요.</p>
        <div className="actions">
          <Link className="button primary" to="/images">이미지 목록</Link>
          <Link className="button" to="/">홈</Link>
        </div>
      </section>
    </main>
  );
}
