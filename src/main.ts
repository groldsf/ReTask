import { App, Plugin, ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import { VIEW_TYPE_REPEATING_TASKS, RepeatingTasksView } from './RepeatingTasksView';
import { RepeatingTask, TaskHistoryEntry, TaskInstance} from './RepeatingTask';
import taskInstances, {} from './testData';

// Основной класс плагина
export default class ReTaskPlugin extends Plugin {
  // Папка с файлами задач (относительно корня vault)
  taskFolder: string = "RepeatingTasks";

  async onload() {
    console.log("Загрузка плагина Повторяющихся Задач");

    // Регистрируем кастомное вью
    this.registerView(VIEW_TYPE_REPEATING_TASKS, (leaf) => new RepeatingTasksView(leaf, this));

    // Регистрируем команду для открытия вью
    this.addCommand({
      id: 'open-reptask-view',
      name: 'Open reptask view',
      callback: () => {
        this.activateView();
      }
    });

    // Добавляем иконку в боковую панель (Ribbon)
    this.addRibbonIcon('checkmark', 'Open reptask view', () => {
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
  

  // Получение списка задач из файлов в указанной папке
  async getActiveTaskInstances(): Promise<TaskInstance[]> {
    return taskInstances;
  }

  // Вычисление состояния просроченности задачи
  // Если текущее время меньше порога green – green, затем yellow, иначе red
  computeOverdueStatus(taskInstance: TaskInstance): "green" | "yellow" | "red" {
    const task = taskInstance.task;
    const now = new Date();
    const endDate = new Date(taskInstance.activePeriod.end);
    const diffMs = now.getTime() - endDate.getTime();
    const diffMinutes = diffMs / 60000;
    if (diffMinutes < task.overdueThresholds.green) {
      return "green";
    } else if (diffMinutes < task.overdueThresholds.yellow) {
      return "yellow";
    } else {
      return "red";
    }
  }

  // Отметка задачи: добавление нового события в историю в YAML frontmatter
  async markTask(taskInstance: TaskInstance, status: "done" | "canceled" | "skipped") {
    const task = taskInstance.task;
    if (!task.filePath) {
      console.error("Путь к файлу не указан для задачи:", task.name);
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!file || !(file instanceof TFile)) {
      console.error("Файл не найден для задачи", task.name);
      return;
    }
    const fileContent = await this.app.vault.read(file);
    const today = new Date().toISOString().split('T')[0];
    const newEntry = {
      date: today,
      status: status,
    };
    const updatedContent = this.updateTaskFileContent(fileContent, newEntry);
    await this.app.vault.modify(file, updatedContent);
    // Обновляем кеш метаданных
    this.app.metadataCache.trigger('resolve', file);
  }

  // Простейшее обновление YAML frontmatter файла
  // (в реальном плагине лучше использовать YAML-парсер)
  updateTaskFileContent(content: string, newEntry: { date: string; status: string }): string {
    const lines = content.split('\n');
    let inFrontmatter = false;
    let newLines: string[] = [];
    let historyAdded = false;
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (line.trim() === '---') {
        if (!inFrontmatter) {
          inFrontmatter = true;
          newLines.push(line);
          continue;
        } else {
          // Если записи истории ещё не добавлены, делаем это перед закрывающей строкой
          if (!historyAdded) {
            newLines.push(`history:`);
            newLines.push(`  - date: "${newEntry.date}"`);
            newLines.push(`    status: "${newEntry.status}"`);
            historyAdded = true;
          }
          newLines.push(line);
          inFrontmatter = false;
          continue;
        }
      }
      if (inFrontmatter && line.startsWith('history:')) {
        newLines.push(line);
        // Добавляем новую запись сразу после поля history
        newLines.push(`  - date: "${newEntry.date}"`);
        newLines.push(`    status: "${newEntry.status}"`);
        historyAdded = true;
        // Пропускаем уже существующие записи истории
        while (i + 1 < lines.length && lines[i + 1].startsWith('  -')) {
          i++;
        }
        continue;
      }
      newLines.push(line);
    }
    return newLines.join('\n');
  }

}
