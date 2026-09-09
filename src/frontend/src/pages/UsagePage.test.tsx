import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithRouter } from "../test/helpers";
import { UsagePage } from "./UsagePage";

describe("UsagePage", () => {
  it("is static: it renders without any network call", () => {
    // fetch를 stub 하지 않는다. 페이지가 호출하면 여기서 터진다.
    renderWithRouter(<UsagePage />);
    expect(
      screen.getByRole("heading", { name: "구성원 누구나 편하게 쓰는 계측 데이터 인프라" }),
    ).toBeInTheDocument();
  });

  it("puts the three roles before the four steps", () => {
    renderWithRouter(<UsagePage />);
    const who = screen.getByRole("heading", { name: "누가 쓰는가" });
    const how = screen.getByRole("heading", { name: "이렇게 쓰세요" });
    // compareDocumentPosition: 2 = who가 how보다 뒤. 앞서야 하므로 4여야 한다.
    expect(who.compareDocumentPosition(how) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    for (const title of [
      "브라우저에서 등록하고 잽니다",
      "찾아보고 비교합니다",
      "API와 데이터 계약으로 받습니다",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });

  it("shows the four steps with the captured screens", () => {
    renderWithRouter(<UsagePage />);
    for (const title of ["이미지 등록", "자동 구획", "핵심 인자 산출", "저장 · 내보내기"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    // 1~3은 캡처 이미지, 4는 내보내기 데이터 카드다.
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.getByLabelText("개발 컨텍스트 내보내기 예시")).toBeInTheDocument();
  });

  it("marks phase 1 done, 2 and 3 in progress, 4 planned", () => {
    renderWithRouter(<UsagePage />);
    const track = screen.getByRole("heading", { name: "어디까지 왔나" }).parentElement!
      .nextElementSibling as HTMLElement;
    const nodes = within(track).getAllByRole("listitem");
    expect(nodes).toHaveLength(4);
    expect(nodes[0].className).toContain("usage-done");
    expect(nodes[1].className).toContain("usage-wip");
    expect(nodes[2].className).toContain("usage-wip");
    expect(nodes[3].className).not.toContain("usage-wip");
    expect(within(nodes[0]).getByText("● 지금 동작")).toBeInTheDocument();
    expect(within(nodes[3]).getByText("○ 로드맵")).toBeInTheDocument();
  });

  it("does not present unbuilt phases as working", () => {
    renderWithRouter(<UsagePage />);
    expect(screen.getByText(/Phase 2부터는 아직/)).toBeInTheDocument();
  });
});
