import { Plugin } from 'obsidian';
import { Notificator } from './services/Notificator';
import { TaskManager } from './services/TaskManager';
import { RepeatingTasksView, VIEW_TYPE_REPEATING_TASKS } from './views/RepeatingTasksView';

declare global {
  var taskManager: TaskManager;
}



// Основной класс плагина
export default class ReTaskPlugin extends Plugin {
  // Папка с файлами задач (относительно корня vault)
  taskFolder: string = "RepeatingTasks";
  taskManager: TaskManager;

  timeoutId: number;

  async onload() {
    Notificator.setDebugMode(true);
    Notificator.debug("Загрузка плагина Повторяющихся Задач");

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

    this.taskManager = new TaskManager(this.app, this);

    //debug
    global.taskManager = this.taskManager;
    await taskManager.clearStorage();


    Notificator.debug('TaskManager instance:', this.taskManager);

    // Ждём полной готовности
    this.app.workspace.onLayoutReady(async () => {
      await this.taskManager.loadTasks();
      await this.taskManager.publicUpdateAllTaskInstances();

      // Устанавливаем интервал для обновления инстансов задач
      // Используем значение из TaskManager для согласованности
      this.registerInterval(
        window.setInterval(
          async () => await this.taskManager.publicUpdateAllTaskInstances(),
          this.taskManager.getUpdateTaskFrequencyMinutes() * 60 * 1000
        )
      );

      const now = new Date();
      const secondsPast = now.getSeconds() + now.getMilliseconds() / 1000; // Текущие секунды с миллисекундами
      const delayToNextMinute = (60 - secondsPast) * 1000; // Миллисекунды до следующей минуты
      // Первый запуск с выравниванием
      this.timeoutId = window.setTimeout(async () => {
        await this.taskManager.publicUpdateInstanceStatuses();
        // Запускаем интервал для последующих выполнений
        this.registerInterval(
          window.setInterval(async () => {
            await this.taskManager.publicUpdateInstanceStatuses();
          }, 60000) // Каждые 60 секунд
        );
      }, delayToNextMinute);

      this.activateView();
    });
  }

  async onunload() {
    Notificator.debug("Выгрузка плагина Повторяющихся Задач");

    window.clearTimeout(this.timeoutId);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_REPEATING_TASKS);
    await this.taskManager.onunload();
    //временный сброс данных при разработке плагина. обязательно убрать в релизе.
    await this.taskManager.clearStorage();
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

  async updateView() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_REPEATING_TASKS).forEach(leaf => {
      const view = leaf.view as RepeatingTasksView;
      view.render();
    });
  }
}
