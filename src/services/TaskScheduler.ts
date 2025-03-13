import { RepeatingTask, TaskInstance, getEndDate } from '../models/RepeatingTask';
import { Notificator } from './Notificator';
import cronParser from 'cron-parser';

export class TaskScheduler {
    // Минимальное количество дней для генерации вперед
    private static MIN_LOOKAHEAD_DAYS = 1;
    /**
     * Генерирует все инстансы задачи, которые должны были быть созданы с момента последнего запуска
     * @param task Задача для генерации инстансов
     * @param lastRunTime Время последнего запуска планировщика
     * @param currentTime Текущее время
     * @param lookAheadDays Количество дней для генерации вперед
     * @returns Массив новых инстансов задачи
     */
    generateTaskInstances(
        task: RepeatingTask, 
        lastRunTime: Date, 
        currentTime: Date = new Date(),
        updateFrequencyMinutes: number
    ): TaskInstance[] {
        const instances: TaskInstance[] = [];

        // Динамически определяем период для генерации инстансов
        // Минимум 1 день или в 4 раза больше периода обновления (в днях)
        const lookAheadDays = Math.max(
            TaskScheduler.MIN_LOOKAHEAD_DAYS,
            (updateFrequencyMinutes * 2) / (60 * 24)
        );

        Notificator.debug(`Generating instances for task ${task.name} with lookAhead of ${lookAheadDays} days`);
        
        // Определяем период для генерации инстансов
        const startTime = this.getStartTimeForGeneration(task, lastRunTime);
        const endTime = new Date(currentTime.getTime() + lookAheadDays * 24 * 60 * 60 * 1000);
        
        // Получаем все даты запуска в этом периоде
        const scheduleDates = this.getScheduleDatesInRange(task, startTime, endTime);
        
        // Создаем инстансы для каждой даты
        for (const date of scheduleDates) {
            const instance = this.createTaskInstance(task, date);
            instances.push(instance);
        }
        
        return instances;
    }
    
    /**
     * Определяет начальное время для генерации инстансов
     */
    private getStartTimeForGeneration(task: RepeatingTask, lastRunTime: Date): Date {
        // Если есть существующие инстансы, начинаем с последнего
        if (task.instances.length > 0) {
            const sortedInstances = [...task.instances].sort(
                (a, b) => a.activePeriod.start.getTime() - b.activePeriod.start.getTime()
            );
            const lastInstance = sortedInstances[sortedInstances.length - 1];
            
            // Начинаем с момента после последнего инстанса
            return new Date(lastInstance.activePeriod.start.getTime() + 1000);
        }
        
        // Если инстансов нет, начинаем с даты начала задачи или последнего запуска
        return new Date(Math.max(task.startTime.getTime(), lastRunTime.getTime()));
    }
    
    /**
     * Получает все даты запуска задачи в заданном диапазоне
     */
    private getScheduleDatesInRange(task: RepeatingTask, startTime: Date, endTime: Date): Date[] {
        const dates: Date[] = [];
        
        switch (task.schedule.type) {
            case 'preset':
                dates.push(...this.getPresetDates(task, startTime, endTime));
                break;
            case 'interval':
                dates.push(...this.getIntervalDates(task, startTime, endTime));
                break;
            case 'cron':
                dates.push(...this.getCronDates(task, startTime, endTime));
                break;
        }
        
        return dates;
    }
    
    /**
     * Создает инстанс задачи на основе даты запуска
     */
    private createTaskInstance(task: RepeatingTask, startDate: Date): TaskInstance {
        const id = `${task.id}-${startDate.getTime()}`;
        return new TaskInstance(
            id,
            task,
            {
                start: startDate,
                end: getEndDate(startDate, task.duration)
            }
        );
    }
    
    /**
     * Получает даты для предустановленных расписаний
     */
    private getPresetDates(task: RepeatingTask, startTime: Date, endTime: Date): Date[] {
        const dates: Date[] = [];
        let current = new Date(startTime);
        
        while (current <= endTime) {
            dates.push(new Date(current));
            
            switch (task.schedule.value) {
                case 'daily':
                    current.setDate(current.getDate() + 1);
                    break;
                case 'weekly':
                    current.setDate(current.getDate() + 7);
                    break;
                case 'monthly':
                    current.setMonth(current.getMonth() + 1);
                    break;
                // Можно добавить другие предустановленные расписания
            }
        }
        
        return dates;
    }
    
    /**
     * Получает даты для интервальных расписаний
     */
    private getIntervalDates(task: RepeatingTask, startTime: Date, endTime: Date): Date[] {
        const dates: Date[] = [];
        let current = new Date(startTime);
        const interval = task.schedule.value as { days: number; hours: number; minutes: number; seconds: number };
        
        const intervalMs = (interval.days * 86400000) +
                          (interval.hours * 3600000) +
                          (interval.minutes * 60000) +
                          (interval.seconds * 1000);
        
        while (current <= endTime) {
            dates.push(new Date(current));
            current = new Date(current.getTime() + intervalMs);
        }
        
        return dates;
    }
    
    /**
     * Получает даты для cron-расписаний
     */
    private getCronDates(task: RepeatingTask, startTime: Date, endTime: Date): Date[] {
        const dates: Date[] = [];
        const cronExpression = task.schedule.value as string;
        
        try {
            const interval = cronParser.parse(cronExpression, {
                currentDate: startTime,
                endDate: endTime,
                tz: 'UTC'
            });
            
            let next: Date;
            while (true) {
                try {
                    next = interval.next().toDate();
                    if (next > endTime) break;
                    dates.push(next);
                } catch (e) {
                    break; // Достигнут конец интервала
                }
            }
        } catch (e) {
            Notificator.error(`Ошибка при разборе cron-выражения: ${cronExpression}`);
        }
        
        return dates;
    }
}