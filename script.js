const filterButtons = [...document.querySelectorAll('[data-filter]')];
const postCards = [...document.querySelectorAll('.post-card')];
const postCount = document.querySelector('#post-count');
const emptyState = document.querySelector('#empty-state');

function setFilter(filter) {
  let visible = 0;
  postCards.forEach((card) => {
    const show = filter === 'all' || card.dataset.category === filter;
    card.hidden = !show;
    if (show) visible += 1;
  });
  postCount.textContent = `${visible} ${visible === 1 ? 'материал' : visible < 5 ? 'материала' : 'материалов'}`;
  emptyState.hidden = visible !== 0;
  filterButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.filter === filter));
}

filterButtons.forEach((button) => button.addEventListener('click', () => setFilter(button.dataset.filter)));

document.querySelectorAll('[data-read]').forEach((button) => {
  button.addEventListener('click', () => {
    const card = button.closest('.post-card');
    const open = card.classList.toggle('is-open');
    button.innerHTML = open ? 'Свернуть <span aria-hidden="true">↑</span>' : 'Читать <span aria-hidden="true">↗</span>';
  });
});

const checks = [...document.querySelectorAll('.check-item input')];
const progress = document.querySelector('.progress-line span');
const progressLabel = document.querySelector('.progress-label');

function updateProgress() {
  const done = checks.filter((check) => check.checked).length;
  const total = checks.length;
  progress.style.width = `${(done / total) * 100}%`;
  progressLabel.textContent = `${done} из ${total} выполнено`;
}

checks.forEach((check) => check.addEventListener('change', updateProgress));
