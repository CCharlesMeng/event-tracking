import { afterEach, describe, expect, it } from "vitest";
import { EventAction } from "../../src/core/event";
import {
  findClickTarget,
  findPaginationContainer,
  isChangeInScope,
  mapTextToAction,
} from "../../src/auto-tracking/scope";
import { $, mount, unmount, PAGINATION_FIXTURE } from "../fixtures/dom";

afterEach(unmount);

describe("mapTextToAction (verb mapping)", () => {
  it("maps download-ish text to DOWNLOAD", () => {
    expect(mapTextToAction("导出")).toBe(EventAction.DOWNLOAD);
    expect(mapTextToAction("下载报表")).toBe(EventAction.DOWNLOAD);
    expect(mapTextToAction("Export")).toBe(EventAction.DOWNLOAD);
  });

  it("maps submit/save, search/query, upload, refresh, confirm", () => {
    expect(mapTextToAction("提交")).toBe(EventAction.SUBMIT);
    expect(mapTextToAction("保存")).toBe(EventAction.SUBMIT);
    expect(mapTextToAction("搜索")).toBe(EventAction.SEARCH);
    expect(mapTextToAction("查询")).toBe(EventAction.SEARCH);
    expect(mapTextToAction("上传附件")).toBe(EventAction.UPLOAD);
    expect(mapTextToAction("刷新")).toBe(EventAction.REFRESH);
    expect(mapTextToAction("确定")).toBe(EventAction.CONFIRM);
  });

  it("is conservative: unmapped or long text returns undefined (caller defaults)", () => {
    expect(mapTextToAction("删除")).toBeUndefined();
    expect(mapTextToAction("详情")).toBeUndefined();
    expect(mapTextToAction("")).toBeUndefined();
    expect(mapTextToAction(undefined)).toBeUndefined();
    expect(mapTextToAction("这是一段很长很长很长很长很长的说明文字不该被当成按钮动词")).toBeUndefined();
  });
});

describe("findClickTarget (v1 click scope)", () => {
  it("resolves clicks inside buttons, links, role=button and role=menuitem", () => {
    mount(`
      <button type="button"><span id="inner">导出</span></button>
      <a id="link">详情</a>
      <div role="button" id="rb">操作</div>
      <div role="menuitem" id="mi">菜单项</div>
    `);
    expect(findClickTarget($("#inner"))?.tagName).toBe("BUTTON");
    expect(findClickTarget($("#link"))).toBe($("#link"));
    expect(findClickTarget($("#rb"))).toBe($("#rb"));
    expect(findClickTarget($("#mi"))).toBe($("#mi"));
  });

  it("resolves bare pagination <li> items via loose class matching", () => {
    mount(`<ul class="my-pager"><li id="p2">2</li></ul>`);
    expect(findClickTarget($("#p2"))).toBe($("#p2"));
  });

  it("returns null for out-of-scope targets (plain cells, divs)", () => {
    mount(`<table><tbody><tr><td id="cell">SO001</td></tr></tbody></table><div id="d">text</div>`);
    expect(findClickTarget($("#cell"))).toBeNull();
    expect(findClickTarget($("#d"))).toBeNull();
  });
});

describe("findPaginationContainer", () => {
  it("matches class pagination/pager and labelled nav", () => {
    mount(PAGINATION_FIXTURE);
    expect(findPaginationContainer($("li a"))).toBe($("ul.pagination"));
    mount(`<nav aria-label="分页"><a id="n1">1</a></nav>`);
    expect(findPaginationContainer($("#n1"))?.tagName).toBe("NAV");
    mount(`<div><a id="plain">1</a></div>`);
    expect(findPaginationContainer($("#plain"))).toBeNull();
  });
});

describe("isChangeInScope (v1 change scope)", () => {
  it("accepts checkbox / radio / select, rejects text inputs and textarea", () => {
    mount(`
      <input type="checkbox" id="cb" />
      <input type="radio" id="rd" />
      <select id="sel"><option>a</option></select>
      <input type="text" id="txt" />
      <textarea id="ta"></textarea>
    `);
    expect(isChangeInScope($("#cb"))).toBe(true);
    expect(isChangeInScope($("#rd"))).toBe(true);
    expect(isChangeInScope($("#sel"))).toBe(true);
    expect(isChangeInScope($("#txt"))).toBe(false);
    expect(isChangeInScope($("#ta"))).toBe(false);
  });
});
