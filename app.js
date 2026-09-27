document.documentElement.classList.add('js');
const panels = [...document.querySelectorAll('.panel')];
const sectionLinks = [...document.querySelectorAll('nav a')];
const avatar = document.getElementById('github-avatar');

async function updateGithubAvatar() {
  if (!avatar) return;

  let fallbackUsed = false;
  avatar.addEventListener('error', () => {
    if (fallbackUsed) return;
    fallbackUsed = true;
    avatar.src = 'avatar.png';
  });

  try {
    const response = await fetch('https://api.github.com/users/pxnami', {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) return;

    const profile = await response.json();
    if (typeof profile.avatar_url !== 'string') return;

    const separator = profile.avatar_url.includes('?') ? '&' : '?';
    avatar.src = `${profile.avatar_url}${separator}size=208&updated=${Date.now()}`;
  } catch {
    // The direct GitHub image remains available when the API cannot be reached.
  }
}

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
updateGithubAvatar();
updateClock();
setInterval(updateClock, 10000);
