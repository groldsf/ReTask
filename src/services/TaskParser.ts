import { RepeatingTask, TaskInstance, Duration, getEndDate, Schedule } from "../models/RepeatingTask";
import { CachedMetadata, TFile } from "obsidian";
import cronParser from 'cron-parser';
import { Notificator } from "./Notificator";

type PresetSchedule = 'daily' | 'weekly' | 'monthly';
type CronSchedule = string;
type IntervalSchedule = {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
};

export class TaskParser {

    parseTask(file: TFile, cache: CachedMetadata): RepeatingTask | null {
        const frontmatter = cache.frontmatter;
        if (!frontmatter) {
            Notificator.error(`No frontmatter found in ${file.path}`);
            return null;
        }

        const task: Partial<RepeatingTask> = { instances: [], filePath: file.path };

        task.name = this.getTaskName(file.path);
        if (!task.name) return null;

        task.id = this.getTaskId(file.path);
        if (!task.id) return null;

        task.description = frontmatter.description || '';
        task.schedule = this.parseSchedule(frontmatter.schedule);
        // Ожидаем ISO-формат с UTC
        const startTime = new Date(frontmatter.startTime);
        if (isNaN(startTime.getTime())) {
            Notificator.error(`Invalid startTime in ${file.path}: ${frontmatter.startTime}`);
            return null;
        }
        task.startTime = startTime;
        task.duration = frontmatter.duration as Duration;
        task.overdueThresholds = frontmatter.overdueThresholds;
        task.enabled = frontmatter.enabled ?? true;

        if (!task.schedule || !task.startTime || !task.duration || !task.overdueThresholds) {
            Notificator.warn(`Invalid task in ${file.path}: missing required fields`);
            return null;
        }

        return task as RepeatingTask;
    }

    private parseSchedule(rawSchedule: PresetSchedule | CronSchedule | IntervalSchedule): Schedule {
        if (typeof rawSchedule === 'string') {
            if (['daily', 'weekly', 'monthly'].includes(rawSchedule)) {
                Notificator.debug(`Parsed as preset: ${rawSchedule}`);
                return { type: 'preset', value: rawSchedule };
            } else if (/^\d+\s+\d+\s+[\d*]+\s+[\d*]+\s+[\d*]+$/.test(rawSchedule)) {
                try {
                    cronParser.parse(rawSchedule, { tz: 'UTC' });
                    Notificator.debug(`Parsed as cron: ${rawSchedule}`);
                    return { type: 'cron', value: rawSchedule };
                } catch {
                    throw new Error(`Invalid cron schedule: ${rawSchedule}`);
                }
            }
            throw new Error(`Invalid schedule string: ${rawSchedule}`);
        } else if (typeof rawSchedule === 'object' && 'days' in rawSchedule) {
            return {
                type: 'interval',
                value: {
                    days: rawSchedule.days || 0,
                    hours: rawSchedule.hours || 0,
                    minutes: rawSchedule.minutes || 0,
                    seconds: rawSchedule.seconds || 0
                }
            };
        }
        throw new Error(`Invalid schedule format: ${JSON.stringify(rawSchedule)}`);
    }

    private getTaskName(filePath: string): string | null {
        const fileName = filePath.split('/').pop()?.replace('.md', '');
        if (!fileName) {
            Notificator.error(`Could not extract name from filePath: ${filePath}`);
            return null;
        }
        return fileName;
    }

    private getTaskId(filePath: string): string | null {
        const fileName = filePath.split('/').pop()?.replace('.md', '');
        if (!fileName) {
            Notificator.error(`Could not extract ID from filePath: ${filePath}`);
            return null;
        }
        return `task-${filePath.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
    }
}