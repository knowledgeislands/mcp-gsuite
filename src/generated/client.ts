// @ts-nocheck
// Generated on 2026-07-18T16:27:32.340Z by @knowledgeislands/mcp-gsuite@0.0.1
// Server: kit-mcp-gsuite
// Source: /Users/krisbrown/.mcporter/mcporter.json
// Transport: STDIO /Users/krisbrown/.local/share/mise/installs/node/lts/bin/node /Users/krisbrown/workspaces/kis/knowledgeislands/mcp-gsuite/dist/mcp-server/index.js

import { createRuntime, createServerProxy, wrapCallResult } from 'mcporter';
import type { KitMcpGsuiteTools } from './types';

type RuntimeInstance = Awaited<ReturnType<typeof createRuntime>>;
export type KitMcpGsuiteClient = KitMcpGsuiteTools & { close(): Promise<void> };

export interface CreateClientOptions {
  runtime?: RuntimeInstance;
  configPath?: string;
  rootDir?: string;
}

export async function createKitMcpGsuiteClient(options: CreateClientOptions = {}): Promise<KitMcpGsuiteClient> {
  const runtime = options.runtime ?? (await createRuntime({
    configPath: options.configPath,
    rootDir: options.rootDir,
  }));
  const ownsRuntime = !options.runtime;
  const proxy = createServerProxy(runtime, "kit-mcp-gsuite");
  const client: KitMcpGsuiteClient = {
    async gsuite_about(params: Parameters<KitMcpGsuiteTools["gsuite_about"]>[0]) {
      const tool = proxy.gsuiteAbout as (args: Parameters<KitMcpGsuiteTools["gsuite_about"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_auth_start(params: Parameters<KitMcpGsuiteTools["gsuite_auth_start"]>[0]) {
      const tool = proxy.gsuiteAuthStart as (args: Parameters<KitMcpGsuiteTools["gsuite_auth_start"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_auth_status(params: Parameters<KitMcpGsuiteTools["gsuite_auth_status"]>[0]) {
      const tool = proxy.gsuiteAuthStatus as (args: Parameters<KitMcpGsuiteTools["gsuite_auth_status"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_labels_list(params: Parameters<KitMcpGsuiteTools["gsuite_email_labels_list"]>[0]) {
      const tool = proxy.gsuiteEmailLabelsList as (args: Parameters<KitMcpGsuiteTools["gsuite_email_labels_list"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_label_create(params: Parameters<KitMcpGsuiteTools["gsuite_email_label_create"]>[0]) {
      const tool = proxy.gsuiteEmailLabelCreate as (args: Parameters<KitMcpGsuiteTools["gsuite_email_label_create"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_label_update(params: Parameters<KitMcpGsuiteTools["gsuite_email_label_update"]>[0]) {
      const tool = proxy.gsuiteEmailLabelUpdate as (args: Parameters<KitMcpGsuiteTools["gsuite_email_label_update"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_messages_search(params: Parameters<KitMcpGsuiteTools["gsuite_email_messages_search"]>[0]) {
      const tool = proxy.gsuiteEmailMessagesSearch as (args: Parameters<KitMcpGsuiteTools["gsuite_email_messages_search"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_message_get(params: Parameters<KitMcpGsuiteTools["gsuite_email_message_get"]>[0]) {
      const tool = proxy.gsuiteEmailMessageGet as (args: Parameters<KitMcpGsuiteTools["gsuite_email_message_get"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_message_raw(params: Parameters<KitMcpGsuiteTools["gsuite_email_message_raw"]>[0]) {
      const tool = proxy.gsuiteEmailMessageRaw as (args: Parameters<KitMcpGsuiteTools["gsuite_email_message_raw"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_message_label(params: Parameters<KitMcpGsuiteTools["gsuite_email_message_label"]>[0]) {
      const tool = proxy.gsuiteEmailMessageLabel as (args: Parameters<KitMcpGsuiteTools["gsuite_email_message_label"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_message_unlabel(params: Parameters<KitMcpGsuiteTools["gsuite_email_message_unlabel"]>[0]) {
      const tool = proxy.gsuiteEmailMessageUnlabel as (args: Parameters<KitMcpGsuiteTools["gsuite_email_message_unlabel"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_message_mark_read(params: Parameters<KitMcpGsuiteTools["gsuite_email_message_mark_read"]>[0]) {
      const tool = proxy.gsuiteEmailMessageMarkRead as (args: Parameters<KitMcpGsuiteTools["gsuite_email_message_mark_read"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_message_mark_unread(params: Parameters<KitMcpGsuiteTools["gsuite_email_message_mark_unread"]>[0]) {
      const tool = proxy.gsuiteEmailMessageMarkUnread as (args: Parameters<KitMcpGsuiteTools["gsuite_email_message_mark_unread"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_message_archive(params: Parameters<KitMcpGsuiteTools["gsuite_email_message_archive"]>[0]) {
      const tool = proxy.gsuiteEmailMessageArchive as (args: Parameters<KitMcpGsuiteTools["gsuite_email_message_archive"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_message_trash(params: Parameters<KitMcpGsuiteTools["gsuite_email_message_trash"]>[0]) {
      const tool = proxy.gsuiteEmailMessageTrash as (args: Parameters<KitMcpGsuiteTools["gsuite_email_message_trash"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_messages_batch_modify(params: Parameters<KitMcpGsuiteTools["gsuite_email_messages_batch_modify"]>[0]) {
      const tool = proxy.gsuiteEmailMessagesBatchModify as (args: Parameters<KitMcpGsuiteTools["gsuite_email_messages_batch_modify"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_attachment_get(params: Parameters<KitMcpGsuiteTools["gsuite_email_attachment_get"]>[0]) {
      const tool = proxy.gsuiteEmailAttachmentGet as (args: Parameters<KitMcpGsuiteTools["gsuite_email_attachment_get"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_attachment_metadata(params: Parameters<KitMcpGsuiteTools["gsuite_email_attachment_metadata"]>[0]) {
      const tool = proxy.gsuiteEmailAttachmentMetadata as (args: Parameters<KitMcpGsuiteTools["gsuite_email_attachment_metadata"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_threads_search(params: Parameters<KitMcpGsuiteTools["gsuite_email_threads_search"]>[0]) {
      const tool = proxy.gsuiteEmailThreadsSearch as (args: Parameters<KitMcpGsuiteTools["gsuite_email_threads_search"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_thread_get(params: Parameters<KitMcpGsuiteTools["gsuite_email_thread_get"]>[0]) {
      const tool = proxy.gsuiteEmailThreadGet as (args: Parameters<KitMcpGsuiteTools["gsuite_email_thread_get"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_thread_label(params: Parameters<KitMcpGsuiteTools["gsuite_email_thread_label"]>[0]) {
      const tool = proxy.gsuiteEmailThreadLabel as (args: Parameters<KitMcpGsuiteTools["gsuite_email_thread_label"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_thread_unlabel(params: Parameters<KitMcpGsuiteTools["gsuite_email_thread_unlabel"]>[0]) {
      const tool = proxy.gsuiteEmailThreadUnlabel as (args: Parameters<KitMcpGsuiteTools["gsuite_email_thread_unlabel"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_thread_mark_read(params: Parameters<KitMcpGsuiteTools["gsuite_email_thread_mark_read"]>[0]) {
      const tool = proxy.gsuiteEmailThreadMarkRead as (args: Parameters<KitMcpGsuiteTools["gsuite_email_thread_mark_read"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_thread_mark_unread(params: Parameters<KitMcpGsuiteTools["gsuite_email_thread_mark_unread"]>[0]) {
      const tool = proxy.gsuiteEmailThreadMarkUnread as (args: Parameters<KitMcpGsuiteTools["gsuite_email_thread_mark_unread"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_thread_archive(params: Parameters<KitMcpGsuiteTools["gsuite_email_thread_archive"]>[0]) {
      const tool = proxy.gsuiteEmailThreadArchive as (args: Parameters<KitMcpGsuiteTools["gsuite_email_thread_archive"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_thread_trash(params: Parameters<KitMcpGsuiteTools["gsuite_email_thread_trash"]>[0]) {
      const tool = proxy.gsuiteEmailThreadTrash as (args: Parameters<KitMcpGsuiteTools["gsuite_email_thread_trash"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_drive_files_list(params: Parameters<KitMcpGsuiteTools["gsuite_drive_files_list"]>[0]) {
      const tool = proxy.gsuiteDriveFilesList as (args: Parameters<KitMcpGsuiteTools["gsuite_drive_files_list"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_sheet_get(params: Parameters<KitMcpGsuiteTools["gsuite_sheet_get"]>[0]) {
      const tool = proxy.gsuiteSheetGet as (args: Parameters<KitMcpGsuiteTools["gsuite_sheet_get"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_sheet_values_get(params: Parameters<KitMcpGsuiteTools["gsuite_sheet_values_get"]>[0]) {
      const tool = proxy.gsuiteSheetValuesGet as (args: Parameters<KitMcpGsuiteTools["gsuite_sheet_values_get"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_sheet_values_update(params: Parameters<KitMcpGsuiteTools["gsuite_sheet_values_update"]>[0]) {
      const tool = proxy.gsuiteSheetValuesUpdate as (args: Parameters<KitMcpGsuiteTools["gsuite_sheet_values_update"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_calendar_calendars_list(params: Parameters<KitMcpGsuiteTools["gsuite_calendar_calendars_list"]>[0]) {
      const tool = proxy.gsuiteCalendarCalendarsList as (args: Parameters<KitMcpGsuiteTools["gsuite_calendar_calendars_list"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_calendar_events_list(params: Parameters<KitMcpGsuiteTools["gsuite_calendar_events_list"]>[0]) {
      const tool = proxy.gsuiteCalendarEventsList as (args: Parameters<KitMcpGsuiteTools["gsuite_calendar_events_list"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_calendar_event_get(params: Parameters<KitMcpGsuiteTools["gsuite_calendar_event_get"]>[0]) {
      const tool = proxy.gsuiteCalendarEventGet as (args: Parameters<KitMcpGsuiteTools["gsuite_calendar_event_get"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_calendar_event_create(params: Parameters<KitMcpGsuiteTools["gsuite_calendar_event_create"]>[0]) {
      const tool = proxy.gsuiteCalendarEventCreate as (args: Parameters<KitMcpGsuiteTools["gsuite_calendar_event_create"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_calendar_event_update(params: Parameters<KitMcpGsuiteTools["gsuite_calendar_event_update"]>[0]) {
      const tool = proxy.gsuiteCalendarEventUpdate as (args: Parameters<KitMcpGsuiteTools["gsuite_calendar_event_update"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_draft_create(params: Parameters<KitMcpGsuiteTools["gsuite_email_draft_create"]>[0]) {
      const tool = proxy.gsuiteEmailDraftCreate as (args: Parameters<KitMcpGsuiteTools["gsuite_email_draft_create"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_draft_update(params: Parameters<KitMcpGsuiteTools["gsuite_email_draft_update"]>[0]) {
      const tool = proxy.gsuiteEmailDraftUpdate as (args: Parameters<KitMcpGsuiteTools["gsuite_email_draft_update"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_drafts_list(params: Parameters<KitMcpGsuiteTools["gsuite_email_drafts_list"]>[0]) {
      const tool = proxy.gsuiteEmailDraftsList as (args: Parameters<KitMcpGsuiteTools["gsuite_email_drafts_list"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async gsuite_email_draft_get(params: Parameters<KitMcpGsuiteTools["gsuite_email_draft_get"]>[0]) {
      const tool = proxy.gsuiteEmailDraftGet as (args: Parameters<KitMcpGsuiteTools["gsuite_email_draft_get"]>[0]) => Promise<unknown>;
      const raw = await tool(params);
      return wrapCallResult(raw).callResult;
    },

    async close() {
      if (ownsRuntime) {
        await runtime.close("kit-mcp-gsuite").catch(() => {});
      }
    },
  };
  return client;
}

