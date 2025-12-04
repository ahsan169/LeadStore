import { Router } from "express";
import { storage } from "../storage";
import { 
  insertPipelineStageSchema,
  insertTaskSchema,
  insertNoteSchema,
  insertReminderSchema,
  insertActivitySchema,
  insertContactSchema,
  insertEmailTrackingSchema,
  insertCallLogSchema,
  insertDocumentSchema,
  insertLeadTagSchema,
} from "@shared/schema";
import { z } from "zod";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

// ========================================
// PIPELINE STAGE ROUTES
// ========================================

router.get("/api/crm/pipeline-stages", requireAuth, async (req, res) => {
  try {
    const stages = await storage.getPipelineStagesByUserId(req.user!.id);
    
    if (stages.length === 0) {
      const defaultStages = [
        { name: "New", color: "#6B7280", order: 0, probability: 10, userId: req.user!.id },
        { name: "Contacted", color: "#3B82F6", order: 1, probability: 20, userId: req.user!.id },
        { name: "Qualified", color: "#8B5CF6", order: 2, probability: 40, userId: req.user!.id },
        { name: "Proposal", color: "#F59E0B", order: 3, probability: 60, userId: req.user!.id },
        { name: "Negotiation", color: "#EC4899", order: 4, probability: 80, userId: req.user!.id },
        { name: "Closed Won", color: "#10B981", order: 5, probability: 100, userId: req.user!.id },
        { name: "Closed Lost", color: "#EF4444", order: 6, probability: 0, userId: req.user!.id },
      ];
      
      const createdStages = [];
      for (const stage of defaultStages) {
        const created = await storage.createPipelineStage(stage);
        createdStages.push(created);
      }
      return res.json(createdStages);
    }
    
    res.json(stages);
  } catch (error) {
    console.error("Error fetching pipeline stages:", error);
    res.status(500).json({ error: "Failed to fetch pipeline stages" });
  }
});

router.post("/api/crm/pipeline-stages", requireAuth, async (req, res) => {
  try {
    const validated = insertPipelineStageSchema.parse({
      ...req.body,
      userId: req.user!.id,
    });
    const stage = await storage.createPipelineStage(validated);
    res.status(201).json(stage);
  } catch (error) {
    console.error("Error creating pipeline stage:", error);
    res.status(400).json({ error: "Failed to create pipeline stage" });
  }
});

router.patch("/api/crm/pipeline-stages/:id", requireAuth, async (req, res) => {
  try {
    const stage = await storage.updatePipelineStage(req.params.id, req.body);
    if (!stage) {
      return res.status(404).json({ error: "Pipeline stage not found" });
    }
    res.json(stage);
  } catch (error) {
    console.error("Error updating pipeline stage:", error);
    res.status(400).json({ error: "Failed to update pipeline stage" });
  }
});

router.delete("/api/crm/pipeline-stages/:id", requireAuth, async (req, res) => {
  try {
    await storage.deletePipelineStage(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting pipeline stage:", error);
    res.status(400).json({ error: "Failed to delete pipeline stage" });
  }
});

// ========================================
// TASK ROUTES
// ========================================

router.get("/api/crm/tasks", requireAuth, async (req, res) => {
  try {
    const { leadId, status, dueToday, overdue } = req.query;
    
    if (leadId) {
      const tasks = await storage.getTasksByLeadId(leadId as string);
      return res.json(tasks);
    }
    
    if (dueToday === "true") {
      const tasks = await storage.getTasksDueToday(req.user!.id);
      return res.json(tasks);
    }
    
    if (overdue === "true") {
      const tasks = await storage.getOverdueTasks(req.user!.id);
      return res.json(tasks);
    }
    
    const tasks = await storage.getTasksByUserId(req.user!.id);
    res.json(tasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

router.post("/api/crm/tasks", requireAuth, async (req, res) => {
  try {
    const validated = insertTaskSchema.parse({
      ...req.body,
      assignedTo: req.body.assignedTo || req.user!.id,
      createdBy: req.user!.id,
    });
    const task = await storage.createTask(validated);
    
    if (task.leadId) {
      await storage.createActivity({
        leadId: task.leadId,
        userId: req.user!.id,
        activityType: "note_added",
        title: `Task created: ${task.title}`,
        description: task.description || "",
      });
    }
    
    res.status(201).json(task);
  } catch (error) {
    console.error("Error creating task:", error);
    res.status(400).json({ error: "Failed to create task" });
  }
});

router.patch("/api/crm/tasks/:id", requireAuth, async (req, res) => {
  try {
    const task = await storage.updateTask(req.params.id, req.body);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    res.json(task);
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(400).json({ error: "Failed to update task" });
  }
});

router.post("/api/crm/tasks/:id/complete", requireAuth, async (req, res) => {
  try {
    const task = await storage.completeTask(req.params.id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    
    if (task.leadId) {
      await storage.createActivity({
        leadId: task.leadId,
        userId: req.user!.id,
        activityType: "task_completed",
        title: `Task completed: ${task.title}`,
      });
    }
    
    res.json(task);
  } catch (error) {
    console.error("Error completing task:", error);
    res.status(400).json({ error: "Failed to complete task" });
  }
});

router.delete("/api/crm/tasks/:id", requireAuth, async (req, res) => {
  try {
    await storage.deleteTask(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting task:", error);
    res.status(400).json({ error: "Failed to delete task" });
  }
});

// ========================================
// NOTE ROUTES
// ========================================

router.get("/api/crm/notes", requireAuth, async (req, res) => {
  try {
    const { leadId, contactId, pinned } = req.query;
    
    if (leadId && pinned === "true") {
      const notes = await storage.getPinnedNotes(leadId as string);
      return res.json(notes);
    }
    
    if (leadId) {
      const notes = await storage.getNotesByLeadId(leadId as string);
      return res.json(notes);
    }
    
    if (contactId) {
      const notes = await storage.getNotesByContactId(contactId as string);
      return res.json(notes);
    }
    
    res.status(400).json({ error: "leadId or contactId required" });
  } catch (error) {
    console.error("Error fetching notes:", error);
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

router.post("/api/crm/notes", requireAuth, async (req, res) => {
  try {
    const validated = insertNoteSchema.parse({
      ...req.body,
      userId: req.user!.id,
    });
    const note = await storage.createNote(validated);
    
    if (note.leadId) {
      await storage.createActivity({
        leadId: note.leadId,
        userId: req.user!.id,
        activityType: "note_added",
        title: "Note added",
        description: note.content.substring(0, 100),
      });
    }
    
    res.status(201).json(note);
  } catch (error) {
    console.error("Error creating note:", error);
    res.status(400).json({ error: "Failed to create note" });
  }
});

router.patch("/api/crm/notes/:id", requireAuth, async (req, res) => {
  try {
    const note = await storage.updateNote(req.params.id, req.body);
    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }
    res.json(note);
  } catch (error) {
    console.error("Error updating note:", error);
    res.status(400).json({ error: "Failed to update note" });
  }
});

router.delete("/api/crm/notes/:id", requireAuth, async (req, res) => {
  try {
    await storage.deleteNote(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting note:", error);
    res.status(400).json({ error: "Failed to delete note" });
  }
});

// ========================================
// REMINDER ROUTES
// ========================================

router.get("/api/crm/reminders", requireAuth, async (req, res) => {
  try {
    const { leadId, upcoming, hours } = req.query;
    
    if (leadId) {
      const reminders = await storage.getRemindersByLeadId(leadId as string);
      return res.json(reminders);
    }
    
    if (upcoming === "true") {
      const hoursValue = hours ? parseInt(hours as string) : 24;
      const reminders = await storage.getUpcomingReminders(req.user!.id, hoursValue);
      return res.json(reminders);
    }
    
    const reminders = await storage.getRemindersByUserId(req.user!.id);
    res.json(reminders);
  } catch (error) {
    console.error("Error fetching reminders:", error);
    res.status(500).json({ error: "Failed to fetch reminders" });
  }
});

router.post("/api/crm/reminders", requireAuth, async (req, res) => {
  try {
    const validated = insertReminderSchema.parse({
      ...req.body,
      userId: req.user!.id,
    });
    const reminder = await storage.createReminder(validated);
    res.status(201).json(reminder);
  } catch (error) {
    console.error("Error creating reminder:", error);
    res.status(400).json({ error: "Failed to create reminder" });
  }
});

router.post("/api/crm/reminders/:id/dismiss", requireAuth, async (req, res) => {
  try {
    const reminder = await storage.dismissReminder(req.params.id);
    if (!reminder) {
      return res.status(404).json({ error: "Reminder not found" });
    }
    res.json(reminder);
  } catch (error) {
    console.error("Error dismissing reminder:", error);
    res.status(400).json({ error: "Failed to dismiss reminder" });
  }
});

router.post("/api/crm/reminders/:id/snooze", requireAuth, async (req, res) => {
  try {
    const { minutes = 30 } = req.body;
    const newTime = new Date(Date.now() + minutes * 60 * 1000);
    const reminder = await storage.snoozeReminder(req.params.id, newTime);
    if (!reminder) {
      return res.status(404).json({ error: "Reminder not found" });
    }
    res.json(reminder);
  } catch (error) {
    console.error("Error snoozing reminder:", error);
    res.status(400).json({ error: "Failed to snooze reminder" });
  }
});

router.delete("/api/crm/reminders/:id", requireAuth, async (req, res) => {
  try {
    await storage.deleteReminder(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting reminder:", error);
    res.status(400).json({ error: "Failed to delete reminder" });
  }
});

// ========================================
// ACTIVITY ROUTES
// ========================================

router.get("/api/crm/activities", requireAuth, async (req, res) => {
  try {
    const { leadId, contactId, limit } = req.query;
    
    if (leadId) {
      const activities = await storage.getActivityTimeline(leadId as string);
      return res.json(activities);
    }
    
    if (contactId) {
      const activities = await storage.getActivitiesByContactId(contactId as string);
      return res.json(activities);
    }
    
    const limitValue = limit ? parseInt(limit as string) : 50;
    const activities = await storage.getRecentActivities(req.user!.id, limitValue);
    res.json(activities);
  } catch (error) {
    console.error("Error fetching activities:", error);
    res.status(500).json({ error: "Failed to fetch activities" });
  }
});

router.post("/api/crm/activities", requireAuth, async (req, res) => {
  try {
    const validated = insertActivitySchema.parse({
      ...req.body,
      userId: req.user!.id,
    });
    const activity = await storage.createActivity(validated);
    res.status(201).json(activity);
  } catch (error) {
    console.error("Error creating activity:", error);
    res.status(400).json({ error: "Failed to create activity" });
  }
});

// ========================================
// CONTACT ROUTES
// ========================================

router.get("/api/crm/contacts", requireAuth, async (req, res) => {
  try {
    const { leadId, search } = req.query;
    
    if (leadId) {
      const contacts = await storage.getContactsByLeadId(leadId as string);
      return res.json(contacts);
    }
    
    if (search) {
      const contacts = await storage.searchContacts(search as string, req.user!.id);
      return res.json(contacts);
    }
    
    const contacts = await storage.getContactsByUserId(req.user!.id);
    res.json(contacts);
  } catch (error) {
    console.error("Error fetching contacts:", error);
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

router.get("/api/crm/contacts/:id", requireAuth, async (req, res) => {
  try {
    const contact = await storage.getContact(req.params.id);
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }
    res.json(contact);
  } catch (error) {
    console.error("Error fetching contact:", error);
    res.status(500).json({ error: "Failed to fetch contact" });
  }
});

router.post("/api/crm/contacts", requireAuth, async (req, res) => {
  try {
    const validated = insertContactSchema.parse({
      ...req.body,
      userId: req.user!.id,
    });
    const contact = await storage.createContact(validated);
    res.status(201).json(contact);
  } catch (error) {
    console.error("Error creating contact:", error);
    res.status(400).json({ error: "Failed to create contact" });
  }
});

router.patch("/api/crm/contacts/:id", requireAuth, async (req, res) => {
  try {
    const contact = await storage.updateContact(req.params.id, req.body);
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }
    res.json(contact);
  } catch (error) {
    console.error("Error updating contact:", error);
    res.status(400).json({ error: "Failed to update contact" });
  }
});

router.delete("/api/crm/contacts/:id", requireAuth, async (req, res) => {
  try {
    await storage.deleteContact(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting contact:", error);
    res.status(400).json({ error: "Failed to delete contact" });
  }
});

// ========================================
// CALL LOG ROUTES
// ========================================

router.get("/api/crm/call-logs", requireAuth, async (req, res) => {
  try {
    const { leadId, contactId } = req.query;
    
    if (leadId) {
      const callLogs = await storage.getCallLogsByLeadId(leadId as string);
      return res.json(callLogs);
    }
    
    if (contactId) {
      const callLogs = await storage.getCallLogsByContactId(contactId as string);
      return res.json(callLogs);
    }
    
    res.status(400).json({ error: "leadId or contactId required" });
  } catch (error) {
    console.error("Error fetching call logs:", error);
    res.status(500).json({ error: "Failed to fetch call logs" });
  }
});

router.post("/api/crm/call-logs", requireAuth, async (req, res) => {
  try {
    const validated = insertCallLogSchema.parse({
      ...req.body,
      userId: req.user!.id,
    });
    const callLog = await storage.createCallLog(validated);
    
    if (callLog.leadId) {
      await storage.createActivity({
        leadId: callLog.leadId,
        userId: req.user!.id,
        activityType: "call",
        title: `${callLog.direction === 'outbound' ? 'Outbound' : 'Inbound'} call - ${callLog.outcome}`,
        description: callLog.notes || "",
        outcome: callLog.outcome,
        direction: callLog.direction,
        duration: callLog.duration,
      });
      
      await storage.updateLead(callLog.leadId, {
        lastContactedAt: new Date(),
      });
    }
    
    res.status(201).json(callLog);
  } catch (error) {
    console.error("Error creating call log:", error);
    res.status(400).json({ error: "Failed to create call log" });
  }
});

// ========================================
// EMAIL TRACKING ROUTES
// ========================================

router.get("/api/crm/emails", requireAuth, async (req, res) => {
  try {
    const { leadId, contactId } = req.query;
    
    if (leadId) {
      const emails = await storage.getEmailsByLeadId(leadId as string);
      return res.json(emails);
    }
    
    if (contactId) {
      const emails = await storage.getEmailsByContactId(contactId as string);
      return res.json(emails);
    }
    
    res.status(400).json({ error: "leadId or contactId required" });
  } catch (error) {
    console.error("Error fetching emails:", error);
    res.status(500).json({ error: "Failed to fetch emails" });
  }
});

router.post("/api/crm/emails", requireAuth, async (req, res) => {
  try {
    const validated = insertEmailTrackingSchema.parse({
      ...req.body,
      userId: req.user!.id,
      sentAt: new Date(),
    });
    const email = await storage.createEmailTracking(validated);
    
    if (email.leadId) {
      await storage.createActivity({
        leadId: email.leadId,
        userId: req.user!.id,
        activityType: "email_sent",
        title: `Email sent: ${email.subject}`,
        description: email.content?.substring(0, 200) || "",
      });
      
      await storage.updateLead(email.leadId, {
        lastContactedAt: new Date(),
      });
    }
    
    res.status(201).json(email);
  } catch (error) {
    console.error("Error creating email:", error);
    res.status(400).json({ error: "Failed to create email" });
  }
});

router.post("/api/crm/emails/:id/open", requireAuth, async (req, res) => {
  try {
    const email = await storage.recordEmailOpen(req.params.id);
    if (!email) {
      return res.status(404).json({ error: "Email not found" });
    }
    res.json(email);
  } catch (error) {
    console.error("Error recording email open:", error);
    res.status(400).json({ error: "Failed to record email open" });
  }
});

router.post("/api/crm/emails/:id/click", requireAuth, async (req, res) => {
  try {
    const email = await storage.recordEmailClick(req.params.id);
    if (!email) {
      return res.status(404).json({ error: "Email not found" });
    }
    res.json(email);
  } catch (error) {
    console.error("Error recording email click:", error);
    res.status(400).json({ error: "Failed to record email click" });
  }
});

// ========================================
// DOCUMENT ROUTES
// ========================================

router.get("/api/crm/documents", requireAuth, async (req, res) => {
  try {
    const { leadId } = req.query;
    
    if (!leadId) {
      return res.status(400).json({ error: "leadId required" });
    }
    
    const documents = await storage.getDocumentsByLeadId(leadId as string);
    res.json(documents);
  } catch (error) {
    console.error("Error fetching documents:", error);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

router.post("/api/crm/documents", requireAuth, async (req, res) => {
  try {
    const validated = insertDocumentSchema.parse({
      ...req.body,
      uploadedBy: req.user!.id,
    });
    const document = await storage.createDocument(validated);
    
    if (document.leadId) {
      await storage.createActivity({
        leadId: document.leadId,
        userId: req.user!.id,
        activityType: "document_sent",
        title: `Document uploaded: ${document.name}`,
      });
    }
    
    res.status(201).json(document);
  } catch (error) {
    console.error("Error creating document:", error);
    res.status(400).json({ error: "Failed to create document" });
  }
});

router.delete("/api/crm/documents/:id", requireAuth, async (req, res) => {
  try {
    await storage.deleteDocument(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting document:", error);
    res.status(400).json({ error: "Failed to delete document" });
  }
});

// ========================================
// LEAD TAG ROUTES
// ========================================

router.get("/api/crm/tags", requireAuth, async (req, res) => {
  try {
    const tags = await storage.getLeadTagsByUserId(req.user!.id);
    res.json(tags);
  } catch (error) {
    console.error("Error fetching tags:", error);
    res.status(500).json({ error: "Failed to fetch tags" });
  }
});

router.post("/api/crm/tags", requireAuth, async (req, res) => {
  try {
    const validated = insertLeadTagSchema.parse({
      ...req.body,
      userId: req.user!.id,
    });
    const tag = await storage.createLeadTag(validated);
    res.status(201).json(tag);
  } catch (error) {
    console.error("Error creating tag:", error);
    res.status(400).json({ error: "Failed to create tag" });
  }
});

router.patch("/api/crm/tags/:id", requireAuth, async (req, res) => {
  try {
    const tag = await storage.updateLeadTag(req.params.id, req.body);
    if (!tag) {
      return res.status(404).json({ error: "Tag not found" });
    }
    res.json(tag);
  } catch (error) {
    console.error("Error updating tag:", error);
    res.status(400).json({ error: "Failed to update tag" });
  }
});

router.delete("/api/crm/tags/:id", requireAuth, async (req, res) => {
  try {
    await storage.deleteLeadTag(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting tag:", error);
    res.status(400).json({ error: "Failed to delete tag" });
  }
});

// ========================================
// LEAD PIPELINE MANAGEMENT
// ========================================

router.patch("/api/crm/leads/:id/pipeline", requireAuth, async (req, res) => {
  try {
    const { pipelineStageId } = req.body;
    
    const oldLead = await storage.getLead(req.params.id);
    const lead = await storage.updateLead(req.params.id, { 
      pipelineStageId,
      assignedTo: oldLead?.assignedTo || req.user!.id,
    });
    
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }
    
    const newStage = await storage.getPipelineStage(pipelineStageId);
    const oldStage = oldLead?.pipelineStageId ? await storage.getPipelineStage(oldLead.pipelineStageId) : null;
    
    await storage.createActivity({
      leadId: lead.id,
      userId: req.user!.id,
      activityType: "stage_change",
      title: `Stage changed from "${oldStage?.name || 'None'}" to "${newStage?.name || 'Unknown'}"`,
    });
    
    res.json(lead);
  } catch (error) {
    console.error("Error updating lead pipeline:", error);
    res.status(400).json({ error: "Failed to update lead pipeline" });
  }
});

router.patch("/api/crm/leads/:id/assign", requireAuth, async (req, res) => {
  try {
    const { assignedTo } = req.body;
    
    const lead = await storage.updateLead(req.params.id, { assignedTo });
    
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }
    
    await storage.createActivity({
      leadId: lead.id,
      userId: req.user!.id,
      activityType: "status_change",
      title: `Lead assigned to user ${assignedTo}`,
    });
    
    res.json(lead);
  } catch (error) {
    console.error("Error assigning lead:", error);
    res.status(400).json({ error: "Failed to assign lead" });
  }
});

// ========================================
// CRM DASHBOARD
// ========================================

router.get("/api/crm/dashboard", requireAuth, async (req, res) => {
  try {
    const stats = await storage.getCrmDashboardStats(req.user!.id);
    
    const upcomingReminders = await storage.getUpcomingReminders(req.user!.id, 24);
    const overdueTasks = await storage.getOverdueTasks(req.user!.id);
    const tasksDueToday = await storage.getTasksDueToday(req.user!.id);
    const recentActivities = await storage.getRecentActivities(req.user!.id, 10);
    
    res.json({
      ...stats,
      upcomingReminders,
      overdueTasks,
      tasksDueToday,
      recentActivities,
    });
  } catch (error) {
    console.error("Error fetching CRM dashboard:", error);
    res.status(500).json({ error: "Failed to fetch CRM dashboard" });
  }
});

// ========================================
// PIPELINE BOARD VIEW
// ========================================

router.get("/api/crm/pipeline-board", requireAuth, async (req, res) => {
  try {
    const stages = await storage.getPipelineStagesByUserId(req.user!.id);
    
    if (stages.length === 0) {
      const defaultStages = [
        { name: "New", color: "#6B7280", order: 0, probability: 10, userId: req.user!.id },
        { name: "Contacted", color: "#3B82F6", order: 1, probability: 20, userId: req.user!.id },
        { name: "Qualified", color: "#8B5CF6", order: 2, probability: 40, userId: req.user!.id },
        { name: "Proposal", color: "#F59E0B", order: 3, probability: 60, userId: req.user!.id },
        { name: "Negotiation", color: "#EC4899", order: 4, probability: 80, userId: req.user!.id },
        { name: "Closed Won", color: "#10B981", order: 5, probability: 100, userId: req.user!.id },
        { name: "Closed Lost", color: "#EF4444", order: 6, probability: 0, userId: req.user!.id },
      ];
      
      for (const stage of defaultStages) {
        await storage.createPipelineStage(stage);
      }
    }
    
    const updatedStages = await storage.getPipelineStagesByUserId(req.user!.id);
    
    const pipelineData = await Promise.all(
      updatedStages.map(async (stage) => {
        const leadsInStage = await storage.getLeadsInPipelineStage(stage.id);
        return {
          ...stage,
          leads: leadsInStage,
          totalValue: leadsInStage.reduce((sum, l) => sum + (parseFloat(l.estimatedValue || '0') || 0), 0),
          count: leadsInStage.length,
        };
      })
    );
    
    res.json(pipelineData);
  } catch (error) {
    console.error("Error fetching pipeline board:", error);
    res.status(500).json({ error: "Failed to fetch pipeline board" });
  }
});

export function registerCrmRoutes(app: any) {
  app.use(router);
  console.log("[CRM Routes] Registered CRM management endpoints");
}
