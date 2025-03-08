import { App, Plugin, ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import { getEndDate, RepeatingTask, TaskInstance } from "../models/RepeatingTask";
import { taskInstances } from 'src/testData';

export class TaskManager {
    constructor(private app: App) { }

    // Получение списка задач из файлов в указанной папке
    async getActiveTaskInstances(): Promise<TaskInstance[]> {
        return taskInstances;
    }

    createTaskInstanceFromTask(task: RepeatingTask, startDate: Date): TaskInstance{
        return {
            id: this.getNewTaskInstanceId(task, startDate),
            task: task,
            activePeriod: {
                start: startDate,
                end: getEndDate(startDate, task.duration),
            },
            status: 'pending',
        };
    }

    getNewTaskInstanceId(task: RepeatingTask, start: Date): string {
        return `${task.id}-${start.getTime()}`;   
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

    // Вычисление состояния просроченности задачи
    // Если текущее время меньше порога green – green, затем yellow, иначе red
    computeOverdueStatus(taskInstance: TaskInstance): "green" | "yellow" | "red" | "black" {
        const task = taskInstance.task;
        const now = new Date();
        const endDate = new Date(taskInstance.activePeriod.end);
        const diffMs = now.getTime() - endDate.getTime();
        const diffMinutes = diffMs / 60000;
        if (diffMinutes < task.overdueThresholds.green) {
            return "green";
        } else if (diffMinutes < task.overdueThresholds.yellow) {
            return "yellow";
        } else if (diffMinutes < task.overdueThresholds.red) {
            return "red";
        } else {
            return "black";
        }
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

