export async function cloudRequest(path, {method='GET', body, signal, account}={}) {
  const base = new URL('api/', new URL('.', window.location.href));
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort',cancel,{once:true});
  const timeout = setTimeout(cancel,20000);
  let response;
  try {
    const headers={...(body?{'Content-Type':'application/json'}:{}),...(account?{'X-Growth-Account':account}:{})};
    response = await fetch(new URL(path.replace(/^\//,''),base), {method,credentials:'same-origin',headers,body:body?JSON.stringify(body):undefined,signal:controller.signal});
    const payload = await response.json().catch(()=>{throw new Error('云端返回格式异常，未确认操作成功');});
  if (!response.ok) {
    const message=payload.message || payload.error || '';
    const translated = ({'username already exists':'这个账号名已被使用，请登录或换一个名字','invalid username or password':'账号名或密码不正确','authentication required':'登录已过期，请重新登录','too many authentication requests':'登录尝试较多，请稍后再试','too many requests':'操作较频繁，请稍后再试','backup revision not found':'这个云端版本已不在最近五个版本中，请刷新','snapshot too large':'记录超过单次云端备份上限，请先导出文件备份'})[message];
    const error = new Error(translated || (/[\u3400-\u9fff]/.test(message)?message:response.status===503?'云端正在处理其他记录，请稍后再试':response.status===404?'云端服务暂不可用，本机记录仍可使用':response.status===400?'云端未接受这份记录，请保留本机备份后重试':'云端操作未完成，请稍后再试'));
    error.status=response.status; error.meta=payload.meta; throw error;
  }
  return payload;
  } catch (error) {
    if(error.status || error.message?.startsWith('云端')) throw error;
    throw new Error(error.name==='AbortError'?'连接超时，请稍后重试':'暂时无法连接云端，本机记录仍可使用');
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort',cancel); }
}
