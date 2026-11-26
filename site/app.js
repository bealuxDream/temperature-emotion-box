const slider = document.querySelector('#room-temperature');
const moodButtons = document.querySelectorAll('[data-select-mood]');
const sliderValue = document.querySelector('#slider-value');
const heroTemperature = document.querySelector('#hero-temp');
const dockState = document.querySelector('#dock-state');
const sampleMessage = document.querySelector('#sample-message');
const chart = document.querySelector('#chart');
const chartLine = document.querySelector('#chart-line');
const chartArea = document.querySelector('#chart-area');
const historyEmpty = document.querySelector('#history-empty');

const moods = {
  cold: { temperature: 17, label: '偏凉', message: '辛苦啦，歇一会儿吧。' },
  comfy: { temperature: 24, label: '刚刚好', message: '辛苦啦，今天也很棒。来，陪你歇一会儿。' },
  warm: { temperature: 31, label: '偏热', message: '终于收工啦！今天也太努力了，给你一个大大的击掌！先把待办放下，想聊聊今天最开心的事吗？' }
};

const min = Number(slider.min);
const max = Number(slider.max);
const history = [];

function plotTemperature(temperature) {
  if (history.at(-1) === temperature) return;

  history.push(temperature);
  if (history.length > 30) history.shift();
  if (history.length < 2) return;

  const points = history.map((value, index) => {
    const x = 7 + index * 866 / (history.length - 1);
    const y = 126 - (value - min) * 112 / (max - min);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  chartLine.setAttribute('points', points);
  chartArea.setAttribute('d', `M ${points} L 873,140 7,140 Z`);
  chart.removeAttribute('hidden');
  historyEmpty.hidden = true;
}

function render() {
  const temperature = Number(slider.value);
  const mood = temperature < 20 ? 'cold' : temperature > 25 ? 'warm' : 'comfy';
  const { label, message } = moods[mood];

  heroTemperature.textContent = temperature;
  sliderValue.value = `${temperature} °C`;
  slider.setAttribute('aria-valuetext', `${temperature} 摄氏度，${label}`);
  slider.style.setProperty('--value', `${(temperature - min) / (max - min) * 100}%`);
  plotTemperature(temperature);

  if (document.body.dataset.mood === mood) return;

  document.body.dataset.mood = mood;
  dockState.textContent = `示例 · ${label}`;
  sampleMessage.textContent = message;
  moodButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.selectMood === mood));
  });
}

slider.addEventListener('input', render);
moodButtons.forEach((button) => {
  button.addEventListener('click', () => {
    slider.value = moods[button.dataset.selectMood].temperature;
    render();
  });
});
render();

const showcaseVideo = document.querySelector('#showcase-video');
const showcasePlay = document.querySelector('.story-play');
const showcaseError = document.querySelector('.story-error');

function playShowcase(start) {
  showcaseError.hidden = true;
  showcaseVideo.currentTime = start;
  showcaseVideo.play().catch((error) => {
    if (error.name !== 'AbortError') showcaseError.hidden = false;
  });
}

showcasePlay.hidden = false;
showcasePlay.addEventListener('click', () => {
  showcaseVideo.focus({ preventScroll: true });
  playShowcase(0);
});
showcaseVideo.addEventListener('play', () => { showcasePlay.hidden = true; });
showcaseVideo.addEventListener('error', () => { showcaseError.hidden = false; });
document.querySelectorAll('[data-video-time]').forEach((chapter) => {
  chapter.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    showcaseVideo.scrollIntoView({ block: 'nearest' });
    playShowcase(Number(chapter.dataset.videoTime));
  });
});
