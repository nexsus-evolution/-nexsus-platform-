const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// ==================== ADMIN AUTHENTICATION ====================
exports.authenticateAdmin = functions.https.onCall(async (data, context) => {
  const { password, verification } = data;
  
  // Validate admin credentials
  if (password === 'EVOLUTIONnexsusTEAM2026@' && verification === 'ALISON AI') {
    // Create custom token with admin claims
    const customToken = await admin.auth().createCustomToken('admin', {
      admin: true,
      role: 'administrator'
    });
    
    // Log authentication
    await admin.firestore().collection('logs').add({
      type: 'admin_auth',
      message: 'Admin authentication successful',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      ip: context.rawRequest.ip,
      userAgent: context.rawRequest.headers['user-agent']
    });
    
    return { success: true, token: customToken };
  }
  
  // Log failed attempt
  await admin.firestore().collection('logs').add({
    type: 'admin_auth',
    message: 'Admin authentication failed',
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    ip: context.rawRequest.ip,
    userAgent: context.rawRequest.headers['user-agent']
  });
  
  return { success: false, error: 'Invalid credentials' };
});

// ==================== FORM SUBMISSION HANDLER ====================
exports.submitForm = functions.https.onCall(async (data, context) => {
  try {
    const { formData, formType } = data;
    
    // Add server timestamp and metadata
    const docData = {
      ...formData,
      formType,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending',
      ip: context.rawRequest.ip,
      userAgent: context.rawRequest.headers['user-agent']
    };
    
    // Save form to Firestore
    const docRef = await admin.firestore().collection('forms').add(docData);
    
    // Create notification for admin
    await admin.firestore().collection('notifications').add({
      message: `Nuova registrazione: ${formType}`,
      data: formData,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
      type: 'form_submission'
    });
    
    // Log the submission
    await admin.firestore().collection('logs').add({
      type: 'form_submission',
      message: `Form submitted: ${formType}`,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      formId: docRef.id,
      ip: context.rawRequest.ip
    });
    
    // Send email notification (optional)
    // await sendEmailNotification(formData, formType);
    
    return { success: true, id: docRef.id };
    
  } catch (error) {
    console.error('Form submission error:', error);
    return { success: false, error: error.message };
  }
});

// ==================== EMAIL NOTIFICATION ====================
exports.sendEmailNotification = functions.firestore
  .document('forms/{formId}')
  .onCreate(async (snap, context) => {
    const formData = snap.data();
    
    // Here you would integrate with an email service like SendGrid, Mailgun, etc.
    // For now, we'll just log it
    console.log('New form submission:', formData);
    
    // Example email content
    const emailContent = {
      to: 'evolutionacademy2026@virgilio.it',
      subject: `Nuova registrazione NEXSUS: ${formData.formType}`,
      html: `
        <h2>Nuova registrazione ricevuta</h2>
        <p><strong>Tipo:</strong> ${formData.formType}</p>
        <p><strong>Nome:</strong> ${formData.nome} ${formData.cognome}</p>
        <p><strong>Email:</strong> ${formData.email}</p>
        <p><strong>Telefono:</strong> ${formData.telefono || 'N/A'}</p>
        <p><strong>Città:</strong> ${formData.citta || 'N/A'}</p>
        <p><strong>Data:</strong> ${new Date().toLocaleString()}</p>
        ${formData.note ? `<p><strong>Note:</strong> ${formData.note}</p>` : ''}
      `
    };
    
    // Log email (in production, send actual email)
    await admin.firestore().collection('logs').add({
      type: 'email_notification',
      message: 'Email notification prepared',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      emailContent
    });
  });

// ==================== FILE UPLOAD VALIDATION ====================
exports.validateFileUpload = functions.storage.object().onFinalize(async (object) => {
  const filePath = object.name;
  const contentType = object.contentType;
  const size = parseInt(object.size);
  
  // File size limits (in bytes)
  const limits = {
    'image/': 10 * 1024 * 1024, // 10MB for images
    'video/': 100 * 1024 * 1024, // 100MB for videos
    'application/pdf': 50 * 1024 * 1024, // 50MB for PDFs
    'text/': 10 * 1024 * 1024 // 10MB for text files
  };
  
  // Check file size
  let maxSize = 50 * 1024 * 1024; // Default 50MB
  for (const [type, limit] of Object.entries(limits)) {
    if (contentType.startsWith(type)) {
      maxSize = limit;
      break;
    }
  }
  
  if (size > maxSize) {
    // Delete the file if it's too large
    await admin.storage().bucket().file(filePath).delete();
    
    // Log the violation
    await admin.firestore().collection('logs').add({
      type: 'file_violation',
      message: `File too large: ${filePath} (${size} bytes)`,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      filePath,
      size,
      contentType
    });
    
    throw new functions.https.HttpsError('invalid-argument', 'File too large');
  }
  
  // Log successful upload
  await admin.firestore().collection('logs').add({
    type: 'file_upload',
    message: `File uploaded: ${filePath}`,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    filePath,
    size,
    contentType
  });
});

// ==================== CLEANUP OLD LOGS ====================
exports.cleanupOldLogs = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30); // Keep logs for 30 days
  
  const oldLogs = await admin.firestore()
    .collection('logs')
    .where('timestamp', '<', cutoff)
    .get();
  
  const batch = admin.firestore().batch();
  oldLogs.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  
  console.log(`Cleaned up ${oldLogs.size} old log entries`);
});

// ==================== ANALYTICS ====================
exports.getAnalytics = functions.https.onCall(async (data, context) => {
  // Verify admin authentication
  if (!context.auth || !context.auth.token.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Get form submissions
    const formsSnapshot = await admin.firestore().collection('forms').get();
    const forms = formsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Get notifications
    const notificationsSnapshot = await admin.firestore().collection('notifications').get();
    const notifications = notificationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Get logs
    const logsSnapshot = await admin.firestore().collection('logs').get();
    const logs = logsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Calculate statistics
    const stats = {
      forms: {
        total: forms.length,
        today: forms.filter(f => f.timestamp && f.timestamp.toDate() >= today).length,
        thisWeek: forms.filter(f => f.timestamp && f.timestamp.toDate() >= thisWeek).length,
        thisMonth: forms.filter(f => f.timestamp && f.timestamp.toDate() >= thisMonth).length,
        byType: {}
      },
      notifications: {
        total: notifications.length,
        unread: notifications.filter(n => !n.read).length,
        today: notifications.filter(n => n.timestamp && n.timestamp.toDate() >= today).length
      },
      logs: {
        total: logs.length,
        today: logs.filter(l => l.timestamp && l.timestamp.toDate() >= today).length,
        thisWeek: logs.filter(l => l.timestamp && l.timestamp.toDate() >= thisWeek).length
      }
    };
    
    // Count forms by type
    forms.forEach(form => {
      const type = form.formType || 'unknown';
      stats.forms.byType[type] = (stats.forms.byType[type] || 0) + 1;
    });
    
    return { success: true, stats };
    
  } catch (error) {
    console.error('Analytics error:', error);
    return { success: false, error: error.message };
  }
});

// ==================== HEALTH CHECK ====================
exports.healthCheck = functions.https.onRequest((req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      firestore: 'operational',
      storage: 'operational',
      auth: 'operational'
    }
  });
});