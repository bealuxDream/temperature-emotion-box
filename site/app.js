const slider = document.getElementById('room-temperature');
const face = document.getElementById('face');
function render() {
  const value = Number(slider.value);
  const cold = value < 20, hot = value > 25;
  document.getElementById('temperature').textContent = value;
  document.getElementById('slider-value').textContent = value + '°C';
  face.className = 'face ' + (cold ? 'cold' : hot ? 'hot' : 'comfortable');
  const state = cold ? '这里有一点凉意' : hot ? '这里有一点热呢' : '刚刚好，想陪你待一会儿';
  face.setAttribute('aria-label', state);
  document.getElementById('feeling').textContent = state;
  document.getElementById('mood').textContent = cold ? '安静柔和' : hot ? '活泼急切' : '温柔自然';
  document.getElementById('length').textContent = cold ? '回复简短' : hot ? '多一点回应' : '话量适中';
  document.getElementById('reply').textContent = cold ? '辛苦啦，歇一会儿吧。' : hot ? '终于收工啦！今天也太努力了，给你一个大大的击掌！先把待办放下，想聊聊今天最开心的事吗？' : '辛苦啦，今天也很棒。来，陪你歇一会儿。';
}
slider.addEventListener('input', render);
render();
