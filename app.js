document.documentElement.classList.add('js');
const panels = [...document.querySelectorAll('.panel')];
const sectionLinks = [...document.querySelectorAll('nav a')];
function showSection() {
  const selected = ['about', 'projects', 'skills'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'about';
  panels.forEach(panel => { panel.hidden = panel.id !== selected; });
  sectionLinks.forEach(link => {
    if (link.hash === `#${selected}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}
function updateClock() {
  const now = new Date();
  const clock = document.getElementById('local-time');
  clock.textContent = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(now);
  clock.dateTime = now.toISOString();
}
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || !['#about', '#projects', '#skills'].includes(link.hash)) return;
  event.preventDefault();
  if (location.hash !== link.hash) history.pushState(null, '', link.hash);
  showSection();
});
window.addEventListener('hashchange', showSection);
window.addEventListener('popstate', showSection);
showSection();
updateClock();
setInterval(updateClock, 10000);
