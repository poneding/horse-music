export async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '请求失败');
  return data;
}

/**
 * 上传表单数据。fetch 没有上传进度事件，所以这类请求改用 XHR 的 upload.onprogress；
 * 返回值和错误信息与 api() 保持一致，调用方按需传 onProgress(已传字节, 总字节)。
 */
export function uploadForm(url, form, options = {}) {
  const { onProgress } = options;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    if (onProgress) {
      xhr.upload.addEventListener('progress', event => {
        onProgress(event.loaded, event.total || 0);
      });
    }
    xhr.addEventListener('load', () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText || '{}'); }
      catch { /* 非 JSON 响应交给下面的状态码判断。 */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `请求失败（${xhr.status}）`));
    });
    xhr.addEventListener('error', () => reject(new Error('网络连接中断，请重试')));
    xhr.addEventListener('abort', () => reject(new Error('上传已取消')));
    xhr.send(form);
  });
}
