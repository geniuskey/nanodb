# -*- coding: utf-8 -*-
"""home-tab-mockup.html 스크린샷 생성 (Playwright). 결과: home-desktop.png / home-empty.png / home-mobile.png"""
import os, sys
from playwright.sync_api import sync_playwright

here = os.path.dirname(os.path.abspath(__file__))
url = "file:///" + os.path.join(here, "home-tab-mockup.html").replace("\\", "/")
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, w, h, state, full in [("home-desktop", 1280, 800, "demo", True), ("home-empty", 1280, 800, "empty", True), ("home-mobile", 390, 844, "empty", True)]:
        pg = b.new_page(viewport={"width": w, "height": h})
        pg.goto(url + "?state=" + state); pg.wait_for_timeout(600)
        pg.screenshot(path=os.path.join(here, name + ".png"), full_page=full)
        print("saved", name); pg.close()
    # 수용 기준: 1280 폭 첫 화면(스크롤 없이) 제목 + 이미지 목록 CTA 보임
    pg = b.new_page(viewport={"width": 1280, "height": 800}); pg.goto(url + "?state=empty"); pg.wait_for_timeout(500)
    pg.screenshot(path=os.path.join(here, "home-first-viewport.png"), full_page=False); print("saved home-first-viewport")
    b.close()
