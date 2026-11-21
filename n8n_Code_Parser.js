const request = $json.body && typeof $json.body === 'object' ? $json.body : $json;
const emailContent = request.email_content || request.email_body || request.raw_email || request.textPlain || request.textHtml || request.text || request.html || '';
if (!String(emailContent).trim()) throw new Error('No email content received.');
const rawFrom = request.from;
const fromValues = Array.isArray(rawFrom?.value) ? rawFrom.value.map(v => v.address).filter(Boolean) : [];
const sender = request.sender_email || fromValues.join(', ') || (typeof rawFrom === 'string' ? rawFrom : rawFrom?.address || rawFrom?.text) || 'unknown@sender.com';
const subject = request.email_subject || request.subject || 'No Subject';
const body = request.email_body || request.textPlain || request.textHtml || request.text || request.html || request.raw_email || emailContent || '';
const headersObject = request.headers || {};
const metadataObject = request.metadata || {};
const headers = request.raw_headers || JSON.stringify({headers:headersObject,metadata:metadataObject});
const parsedDate = request.email_date || request.date || new Date().toISOString();
const authText = (typeof headersObject === 'string' ? headersObject : JSON.stringify(headersObject)) + ' ' + JSON.stringify(metadataObject);
function authState(protocol) {
  const match = authText.match(new RegExp(protocol + '=([a-z]+)','i'));
  return match ? match[1].toLowerCase() : 'not_found';
}
const authentication = {spf:authState('spf'),dkim:authState('dkim'),dmarc:authState('dmarc')};
const urlMatches = String(emailContent).match(/https?:\/\/[^\s<>"')\]]+/gi) || [];
const links = [...new Map(urlMatches.map(raw => {
  const cleaned = raw.replace(/&amp;/gi,'&').replace(/[.,;!?]+$/,'');
  try { const u = new URL(cleaned); return [u.origin + u.pathname,{host:u.hostname,path:u.pathname || '/'}]; }
  catch { return [cleaned,null]; }
}).filter(entry => entry[1])).values()];
const signalText = `${subject}\n${emailContent}`.toLowerCase();
const suspicionReasons = [];
const credentialTerms = /(?:password|passcode|username|user\s*name|credentials?|sign\s*in|log\s*in|login|كلمة\s*المرور|كلمه\s*المرور|كلمة\s*السر|باسورد|اسم\s*المستخدم|اسم\s*الدخول|تسجيل\s*الدخول|سجل\s*الدخول)/i;
const actionTerms = /(?:enter|provide|confirm|verify|submit|update|reset|restore|validate|ادخل|أدخل|قم\s*بتسجيل|سجل\s*الدخول|تحقق|أكد|تأكيد|حدّث|تحديث|استعد|استعادة)/i;
if (credentialTerms.test(signalText) && actionTerms.test(signalText)) suspicionReasons.push('طلب بيانات دخول أو كلمة مرور');
const linkActionTerms = /(?:click|open|visit|follow|access|go\s+to|review|verify|confirm|update|اضغط|انقر|افتح|ادخل|أدخل|اذهب|انتقل|زور|الرابط|تحقق|أكد|تأكيد|حدّث|تحديث)/i;
if (links.length && linkActionTerms.test(signalText)) suspicionReasons.push('رابط مرفق مع دعوة لفتحه أو التحقق من الحساب');
const urgencyTerms = /(?:urgent|immediately|suspended|blocked|expire|within\s+\d+\s+hours?|عاجل|فوراً|فورا|موقوف|محظور|سيتم\s*إغلاق|إغلاق\s*الحساب|ينتهي|خلال\s*\d+)/i;
if (links.length && urgencyTerms.test(signalText) && !suspicionReasons.length) suspicionReasons.push('رابط مصحوب بتهديد أو استعجال');
const scanText = String(emailContent).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,' ');
const context = {sender_email:String(sender).slice(0,255),email_subject:String(subject).slice(0,255),email_body:String(body),email_date:parsedDate,raw_headers:String(headers),reporter_ou:request.reporter_ou || 'SOC_IMAP_Workflow',campaign_id:request.campaign_id || null,links,authentication,is_suspicious:suspicionReasons.length>0,suspicion_reasons:suspicionReasons};
const domainRegex=/\b(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,63}\b/g, ipRegex=/\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const privateIpRanges=[/^10\./,/^172\.(1[6-9]|2[0-9]|3[0-1])\./,/^192\.168\./,/^127\./,/^169\.254\./];
const unwantedDomains=[/\.outlook\.com$/i,/\.protection\.outlook\.com$/i,/\.office365\.com$/i,/^smtp\.mailfrom$/i,/^header\.from$/i];
const domains=[...new Set(scanText.match(domainRegex)||[])].filter(d=>!unwantedDomains.some(p=>p.test(d))&&d.length<=253);
const ips=[...new Set(String(emailContent).match(ipRegex)||[])].filter(ip=>ip.split('.').every(o=>Number(o)<=255)&&!privateIpRanges.some(p=>p.test(ip)));
const indicators=domains.map(value=>({type:'Domain',value})).concat(ips.map(value=>({type:'IP',value})));
if (!context.is_suspicious) return [];
return (indicators.length?indicators:[{type:'None',value:'No public indicators found'}]).map(i=>({json:{...context,...i}}));
