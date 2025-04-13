document.addEventListener('DOMContentLoaded', () => {
  const taskLists = document.querySelectorAll('.task-list');

  taskLists.forEach(list => {
    list.addEventListener('dragover', e => {
      e.preventDefault();
      const dragging = document.querySelector('.dragging');
      list.appendChild(dragging);
    });
  });
});

function addTask(columnId) {
  const taskText = prompt("Enter task name:");
  if (!taskText) return;
  const task = document.createElement('div');
  task.className = 'task';
  task.draggable = true;
  task.textContent = taskText;

  task.addEventListener('dragstart', () => {
    task.classList.add('dragging');
  });
  task.addEventListener('dragend', () => {
    task.classList.remove('dragging');
  });

  document.getElementById(columnId).appendChild(task);
}
