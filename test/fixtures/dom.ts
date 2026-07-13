/** DOM fixtures + dispatch helpers for the auto-capture tests (jsdom). */

/** Order-list card: heading above the table, rows with inline 导出/删除 actions. */
export const ORDER_TABLE_CARD = `
<div class="card">
  <h3>订单列表</h3>
  <table>
    <thead>
      <tr><th>订单号</th><th>金额</th><th>操作</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>SO20260708001</td><td>100</td>
        <td><button type="button">导出</button><button type="button">删除</button></td>
      </tr>
      <tr>
        <td>SO20260708002</td><td>200</td>
        <td><button type="button">导出</button><button type="button">删除</button></td>
      </tr>
    </tbody>
  </table>
</div>`;

/** Same table but with explicit data-track-* overrides. */
export const OVERRIDDEN_TABLE = `
<table data-track-name="订单表" data-track-row-label="金额">
  <thead>
    <tr><th>订单号</th><th>金额</th><th>操作</th></tr>
  </thead>
  <tbody>
    <tr>
      <td>SO20260708001</td><td>100</td>
      <td><button type="button" data-track-control="exportBtn">导出</button></td>
    </tr>
  </tbody>
</table>`;

export const IGNORED_SUBTREE = `
<div data-track-ignore>
  <button type="button">导出</button>
</div>`;

export const SEARCH_FORM = `
<form class="search-form">
  <label>关键词 <input type="text" name="keyword" /></label>
  <button type="submit">查询</button>
</form>`;

export const PLAIN_FORM = `
<form id="settings-form">
  <label>备注 <input type="text" name="remark" /></label>
  <button type="submit">保存</button>
</form>`;

export const SWITCH_FIXTURE = `
<label class="switch">自动同步 <input type="checkbox" /></label>`;

export const CHECKBOX_FIXTURE = `
<label>接收通知 <input type="checkbox" /></label>`;

export const RADIO_FIXTURE = `
<fieldset>
  <legend>配送方式</legend>
  <label>快递 <input type="radio" name="delivery" value="express" /></label>
</fieldset>`;

export const SELECT_FIXTURE = `
<label for="status-select">状态</label>
<select id="status-select"><option>全部</option><option>待处理</option></select>`;

export const PAGINATION_FIXTURE = `
<ul class="pagination">
  <li><a>1</a></li>
  <li><a>2</a></li>
  <li><a>下一页</a></li>
</ul>`;

export const TABS_FIXTURE = `
<div role="tablist">
  <button type="button" role="tab">全部</button>
  <button type="button" role="tab">待发货</button>
</div>`;

export function mount(html: string): void {
  document.body.innerHTML = html;
}

export function unmount(): void {
  document.body.innerHTML = "";
}

/** querySelector that throws on a missing fixture element (test bug). */
export function $(selector: string): Element {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`fixture element not found: ${selector}`);
  return el;
}

export function click(el: Element): void {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

export function submit(form: Element): void {
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

export function change(el: Element): void {
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
