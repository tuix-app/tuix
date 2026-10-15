// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({request: vi.fn(), start: vi.fn(), stop: vi.fn(), refresh: async () => {}}));
vi.mock('../src/api', () => ({Api: class {environment='uat';request=mock.request;destroy(){}}}));
vi.mock('../src/live', () => ({liveUpdates: (_api: unknown, refresh: () => Promise<void>) => {mock.start();mock.refresh=refresh;return {stop: mock.stop};}}));
import { mount } from '../src/core';
import type { Core } from '../src/types';
let core: Core | undefined;
afterEach(()=>{core?.destroy();core=undefined;vi.useRealTimers();vi.unstubAllGlobals();vi.clearAllMocks();document.body.replaceChildren();});
it('starts only after active admission and applies disablement even when authorized reads are denied', async()=>{
  vi.useFakeTimers();vi.stubGlobal('matchMedia',()=>({matches:true}));
  let enabled=true;
  mock.request.mockImplementation(async(path:string)=>{
    if(path==='/config')return {enabled,telemetry:false,capture:{screenshot:false,console:false,network:false}};
    if(!enabled)throw new Error('403');
    if(path.startsWith('/issues?'))return {issues:[]};
    return {notifications:[]};
  });
  const host=document.createElement('div');document.body.append(host);const root=host.attachShadow({mode:'closed'});
  const launcher=document.createElement('button');document.body.append(launcher);
  core=mount(root,launcher,{project:'fixture'},{id:'reviewer',name:'Reviewer'},()=>{});
  await vi.advanceTimersByTimeAsync(200);expect(mock.start).not.toHaveBeenCalled();
  core.open();await vi.advanceTimersByTimeAsync(200);expect(mock.start).toHaveBeenCalledTimes(1);
  enabled=false;
  await mock.refresh().catch(()=>{});await vi.advanceTimersByTimeAsync(200);
  expect(root.textContent).toContain('Feedback is disabled for this project.');
  expect(mock.stop).toHaveBeenCalled();
  core.close();await vi.advanceTimersByTimeAsync(200);
  const count=mock.request.mock.calls.length;await mock.refresh();
  await vi.advanceTimersByTimeAsync(120000);expect(mock.request).toHaveBeenCalledTimes(count);
});

it('ignores an old live refresh that finishes after closing and reopening', async()=>{
  vi.useFakeTimers();vi.stubGlobal('matchMedia',()=>({matches:true}));
  let defer=false, resolve!: (value: unknown)=>void;
  mock.request.mockImplementation(async(path:string)=>{
    if(path==='/config')return {telemetry:false,capture:{screenshot:false,console:false,network:false}};
    if(path.startsWith('/issues?'))return defer ? new Promise(r=>resolve=r) : {issues:[]};
    return {notifications:[]};
  });
  const host=document.createElement('div');document.body.append(host);const root=host.attachShadow({mode:'closed'});
  const launcher=document.createElement('button');document.body.append(launcher);
  core=mount(root,launcher,{project:'fixture'},{id:'reviewer',name:'Reviewer'},()=>{});
  core.open();await vi.advanceTimersByTimeAsync(200);
  defer=true;const oldRefresh=mock.refresh();
  core.close();await vi.advanceTimersByTimeAsync(200);
  defer=false;core.open();await vi.advanceTimersByTimeAsync(200);
  const count=mock.request.mock.calls.length;
  resolve({issues:[]});await oldRefresh;
  expect(mock.request).toHaveBeenCalledTimes(count);
  expect(mock.start).toHaveBeenCalledTimes(2);
});
