import { Plugin } from 'obsidian';
import { VIEW_TYPE_REPEATING_TASKS, RepeatingTasksView } from './views/RepeatingTasksView';
import { TaskManager } from './services/TaskManager';
import { Notificator } from './services/Notificator'

// Основной класс плагина
export default class ReTaskPlugin extends Plugin {
  // Папка с файлами задач (относительно корня vault)
  taskFolder: string = "RepeatingTasks";
  taskManager: TaskManager = new TaskManager(this.app, this);
  instanceGeneratorIntervalId: NodeJS.Timer;

  async onload() {
    Notificator.setDebugMode(true);

    Notificator.debug("Загрузка плагина Повторяющихся Задач");
    Notificator.debug('TaskManager instance:', this.taskManager);

    await this.taskManager.loadTasks();

    // Устанавливаем таймер для генерации инстансов каждые 23 часа
    const weekInMs = (24-1) * 60 * 60 * 1000;
    this.instanceGeneratorIntervalId = setInterval(async () => {
      Notificator.debug('Weekly task instance generation triggered');
      await this.taskManager.generateNextInstancesForTasks();
    }, weekInMs);

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

    this.activateView();
  }

  async onunload() {
    Notificator.debug("Выгрузка плагина Повторяющихся Задач");
    if (this.instanceGeneratorIntervalId) {
      clearInterval(this.instanceGeneratorIntervalId); // Очищаем таймер при выгрузке
      this.instanceGeneratorIntervalId = null;
    }
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_REPEATING_TASKS);
    this.taskManager.clearStorage();
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
