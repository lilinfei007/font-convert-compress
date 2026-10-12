// Navigation and result lifecycle are independent of font parsing and storage.
export function createWorkflow({ getState }) {
  const $ = (id) => document.getElementById(id);
  const steps = [...document.querySelectorAll('[data-step]')];
  const navigation = [...document.querySelectorAll('[data-step-target]')];
  const tips = [
    '首次转换后，原始字体会自动保存，下次可以直接复用。',
    '只保留实际用到的字符，通常比单纯转换格式更能减小体积。',
    'WOFF2 适合现代网页；需要安装到电脑时，可以选择 TTF。',
    '以后补充文案时，使用增量更新，就能保留旧字符并加入新内容。'
  ];
  let current = 0;
  let busy = false;
  let resultUrl = '';
  let resultCurrent = false;

  function allowed(step, state) {
    return step === 0 || (step === 1 && state.sourceReady) ||
      (step === 2 && state.sourceReady && state.charactersReady) ||
      (step === 3 && resultCurrent);
  }

  function render() {
    const state = getState();
    steps.forEach((step, index) => step.classList.toggle('is-hidden', index !== current));
    navigation.forEach((button, index) => {
      button.disabled = busy || !allowed(index, state);
      if (index === current) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
      const complete = index === 0 ? state.sourceReady : index === 1 ? state.charactersReady && state.sourceReady : resultCurrent;
      button.classList.toggle('is-complete', complete && index !== current);
      button.querySelector('.step-check').textContent = complete && index !== current ? '✓' : '';
    });
    $('stepProgress').textContent = `步骤 0${current + 1} / 04`;
    $('stepProgressBar').style.width = `${(current + 1) * 25}%`;
    $('workspaceMode').textContent = state.mode;
    $('stepTip').textContent = tips[current];
    $('previousStep').classList.toggle('is-hidden', current === 0);
    $('previousStep').disabled = busy;
    $('previousStep').textContent = current === 3 ? '← 调整设置' : '← 上一步';
    $('nextStep').classList.toggle('is-hidden', current > 1);
    $('nextStep').textContent = current === 0 ? '下一步：设置字符 →' : '下一步：确认导出 →';
    $('nextStep').disabled = busy || !allowed(current + 1, state);
    $('convertButton').classList.toggle('is-hidden', current !== 2);
    $('convertButton').disabled = busy || !state.ready;
    $('convertButton').textContent = busy ? '正在生成…' : `生成 ${state.format} 字体`;
    $('restartWorkflow').classList.toggle('is-hidden', current !== 3);
    $('restartWorkflow').disabled = busy;
    document.querySelector('.brand').setAttribute('aria-disabled', String(busy));
    $('stepHint').textContent = busy ? '完成后会自动进入结果页' : current === 0
      ? state.sourceReady ? '字体已就绪，可以继续' : state.sourceMessage
      : current === 1 ? state.charactersReady ? '字符已就绪，可以继续' : state.charactersMessage
      : current === 2 ? '生成后可预览并下载' : '可重复下载，或返回调整设置';
    $('reviewSource').textContent = state.sourceName;
    $('reviewCharacters').textContent = state.characters;
    $('workflowFields').disabled = busy;
    $('busyIndicator').classList.toggle('is-hidden', !busy);
    $('workflowFields').setAttribute('aria-busy', String(busy));
    const incremental = state.mode === '增量更新';
    $('fullModeTitle').textContent = incremental ? '不新增字符' : '保留全部';
    $('fullModeHelp').textContent = incremental ? '按现有子集重新生成' : '仅转换格式，不裁剪字符';
    $('characterInputLabel').textContent = incremental ? '这次需要新增的文案' : '需要保留的文案';
  }

  function go(step) {
    if (busy || !allowed(step, getState())) return;
    current = step;
    render();
    steps[current].querySelector('h2').focus({ preventScroll: true });
    document.querySelector('.workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (current !== 3) {
      $('status').textContent = '';
      $('status').className = 'status';
    }
  }

  navigation.forEach(button => button.addEventListener('click', () => go(Number(button.dataset.stepTarget))));
  document.querySelectorAll('[data-edit-step]').forEach(button => button.addEventListener('click', () => go(Number(button.dataset.editStep))));
  $('nextStep').addEventListener('click', () => go(current + 1));
  document.querySelector('.brand').addEventListener('click', event => {
    if (busy) event.preventDefault();
  });
  $('previousStep').addEventListener('click', () => go(current - 1));
  $('restartWorkflow').addEventListener('click', () => {
    go(0);
    $('operationFresh').checked = true;
    $('operationFresh').dispatchEvent(new Event('change', { bubbles: true }));
    $('resetSourceButton').click();
    $('existingSubsetUrl').value = '';
    $('existingSubsetUrl').dispatchEvent(new Event('input', { bubbles: true }));
    $('existingSubsetFile').value = '';
    $('existingSubsetFile').dispatchEvent(new Event('change', { bubbles: true }));
    $('charsetFile').value = '';
    $('charsetFile').dispatchEvent(new Event('change', { bubbles: true }));
    $('subsetText').value = '';
    $('subsetText').dispatchEvent(new Event('input', { bubbles: true }));
    $('modeManual').checked = true;
    $('modeManual').dispatchEvent(new Event('change', { bubbles: true }));
  });
  document.querySelectorAll('[data-characters]').forEach(button => button.addEventListener('click', () => {
    const field = $('subsetText');
    field.value = [...new Set([...field.value, ...button.dataset.characters])].join('');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus();
  }));
  // Any edited input invalidates the previous export, but returning between steps preserves inputs.
  function invalidate(event) {
    if (busy || event.target.closest('[data-step="3"]')) return;
    resultCurrent = false;
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = '';
    $('downloadResult').removeAttribute('href');
    render();
  }
  $('workflowFields').addEventListener('input', invalidate);
  $('workflowFields').addEventListener('change', invalidate);
  // Source choices made by buttons also change the export inputs.
  ['useSavedSourceButton', 'resetSourceButton', 'deleteSavedSourceButton', 'connectRepositoryButton', 'useLocalStorageButton'].forEach(id => {
    $(id).addEventListener('click', invalidate);
  });
  window.addEventListener('beforeunload', () => { if (resultUrl) URL.revokeObjectURL(resultUrl); });

  return {
    get busy() { return busy; },
    render,
    start() {
      busy = true;
      resultCurrent = false;
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultUrl = '';
      $('downloadResult').removeAttribute('href');
      render();
    },
    finish() {
      busy = false;
      render();
      if (resultCurrent) go(3);
    },
    setResult({ blob, outputName, sourceBytes, outputBytes, subsetCount }) {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultUrl = URL.createObjectURL(blob);
      resultCurrent = true;
      const { formatBytes, format } = getState();
      $('downloadResult').href = resultUrl;
      $('downloadResult').download = outputName;
      $('resultFilename').textContent = outputName;
      $('resultSize').textContent = formatBytes(outputBytes);
      const percent = sourceBytes > 0 ? ((1 - outputBytes / sourceBytes) * 100) : 0;
      $('resultSaving').textContent = percent >= 0 ? `比原始字体减小 ${percent.toFixed(1)}%` : `比原始字体增大 ${Math.abs(percent).toFixed(1)}%`;
      $('resultOriginalSize').textContent = formatBytes(sourceBytes);
      $('resultCharacterCount').textContent = subsetCount ? `${subsetCount.toLocaleString()} 个` : '全部字符';
      $('resultFormat').textContent = format;
    }
  };
}
