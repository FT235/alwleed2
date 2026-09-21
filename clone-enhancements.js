(() => {
  const message = (text) => window.setTimeout(() => window.alert(text), 0);
  const json = (form) => Object.fromEntries(new FormData(form).entries());
  document.addEventListener('DOMContentLoaded', () => {
    const reveal = () => document.querySelectorAll('[x-show="showForm"]').forEach((node) => { node.style.display = 'block'; node.removeAttribute('x-cloak'); });
    document.querySelectorAll('input[name="program_id"]').forEach((radio) => radio.addEventListener('change', reveal));
    const apply = document.querySelector('#application-form');
    if (apply) apply.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!apply.checkValidity()) { apply.reportValidity(); return; }
      try { const response = await fetch('/api/applications', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({data: json(apply)}) }); const result = await response.json(); if (!response.ok) throw Error(result.error || 'تعذر حفظ الطلب'); apply.reset(); message('تم إرسال طلبك وحفظه في قاعدة البيانات. رقم الطلب: ' + result.reference_number); }
      catch (error) { message(error.message); }
    });
    const track = [...document.querySelectorAll('form')].find((form) => form.querySelector('[name="reference_number"]'));
    if (track) track.addEventListener('submit', async (event) => {
      event.preventDefault(); const ref = (track.querySelector('[name="reference_number"]')?.value || '').trim();
      try { const response = await fetch('/api/track/' + encodeURIComponent(ref)); const result = await response.json(); if (!response.ok || result.error) throw Error(result.error || 'لم يتم العثور على الطلب'); message('حالة الطلب ' + result.reference_number + ': ' + result.status); } catch (error) { message(error.message); }
    });
    document.querySelectorAll('form[wire\\:submit\\.prevent]').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault(); const data = json(form); try { const r = await fetch('/api/contact', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); const result=await r.json(); if(!r.ok) throw Error(result.error); form.reset(); message('تم حفظ رسالتك بنجاح.'); } catch(error) { message(error.message); }
    }));
  });
})();
