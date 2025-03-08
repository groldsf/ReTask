import { Plugin } from 'obsidian';
import { VIEW_TYPE_REPEATING_TASKS, RepeatingTasksView } from './views/RepeatingTasksView';
import { TaskManager } from './services/TaskManager';

// Основной класс плагина
export default class ReTaskPlugin extends Plugin {
  // Папка с файлами задач (относительно корня vault)
  taskFolder: string = "RepeatingTasks";
  taskManager: TaskManager = new TaskManager(this.app);

  async onload() {
    console.log("Загрузка плагина Повторяющихся Задач");

    // Регистрируем кастомное вью
    this.registerView(VIEW_TYPE_REPEATING_TASKS, (leaf) => new RepeatingTasksView(leaf, this.taskManager));

    // Регистрируем команду для открытия вью
    this.addCommand({
      id: 'open-retask-view',
      name: 'Open retask view',
      callback: () => {
        this.activateView();
      }
    });

    // Добавляем иконку в боковую панель (Ribbon)
    this.addRibbonIcon('checkmark', 'Open retask view', () => {
      this.activateView();
    });
  }

  async onunload() {
    console.log("Выгрузка плагина Повторяющихся Задач");
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_REPEATING_TASKS);
  }

  // Активация вью (открытие панели с задачами)
  async activateView() {
    const existingLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_REPEATING_TASKS);
    
    if (existingLeaf.length > 0) {
      // Если представление уже открыто, просто сфокусируемся на нем
      this.app.workspace.revealLeaf(existingLeaf[0]);
      return;
    }
  
    // Если нет, открываем новую вкладку
    const leaf = this.app.workspace.getRightLeaf(false);
    await leaf.setViewState({
      type: VIEW_TYPE_REPEATING_TASKS,
      active: true,
    });
    this.app.workspace.revealLeaf(leaf);
  }
}
