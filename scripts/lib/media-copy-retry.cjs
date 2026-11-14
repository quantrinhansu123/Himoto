module.exports=error=>{
 const code=error.code||error.cause?.code;
 return ['AbortError','TimeoutError'].includes(error.name)
  ||['ECONNRESET','ECONNABORTED','ETIMEDOUT','EAI_AGAIN','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','40001','40P01'].includes(code)
  ||error.$metadata?.httpStatusCode===429||error.$metadata?.httpStatusCode>=500
  ||/^SOURCE_HTTP_(429|5\d\d)$/.test(error.message||'');
};
