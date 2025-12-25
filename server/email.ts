import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || 'test_key');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@landofleads.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@landofleads.com';

export async function sendOrderConfirmation(to: string, orderData: any) {
  try {
    const { data, error } = await resend.emails.send({
      from: `Land of Leads <${FROM_EMAIL}>`,
      to: [to],
      subject: `Order Confirmation - ${orderData.tier} Tier Package`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #1976d2; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background: #f5f5f5; }
              .footer { padding: 20px; text-align: center; color: #666; }
              .button { 
                display: inline-block; 
                padding: 12px 24px; 
                background: #1976d2; 
                color: white; 
                text-decoration: none; 
                border-radius: 5px;
                margin: 10px 0;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Land of Leads</h1>
                <p>Your Order Has Been Confirmed!</p>
              </div>
              <div class="content">
                <h2>Order Details</h2>
                <p><strong>Package:</strong> ${orderData.tier.toUpperCase()} Tier</p>
                <p><strong>Lead Count:</strong> ${orderData.leadCount} leads</p>
                <p><strong>Total Amount:</strong> $${orderData.totalAmount}</p>
                <p><strong>Order ID:</strong> ${orderData.id}</p>
                
                <h3>What's Next?</h3>
                <p>Your leads are being prepared and will be available for download shortly. You'll receive another email with your download link once they're ready.</p>
                
                <p>The download link will be valid for 24 hours from the time it's generated.</p>
                
                <a href="${process.env.VITE_SITE_URL || 'http://localhost:5000'}/purchases" class="button">
                  View Your Purchases
                </a>
              </div>
              <div class="footer">
                <p>© 2025 Land of Leads. All rights reserved.</p>
                <p>Questions? Contact us at support@landofleads.com</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('Failed to send order confirmation:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Error sending order confirmation:', err);
    return { success: false, error: err };
  }
}

export async function sendDownloadReady(to: string, downloadUrl: string, orderData: any) {
  try {
    const { data, error } = await resend.emails.send({
      from: `Land of Leads <${FROM_EMAIL}>`,
      to: [to],
      subject: `Your Leads Are Ready for Download`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #1976d2; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background: #f5f5f5; }
              .footer { padding: 20px; text-align: center; color: #666; }
              .button { 
                display: inline-block; 
                padding: 12px 24px; 
                background: #4caf50; 
                color: white; 
                text-decoration: none; 
                border-radius: 5px;
                margin: 10px 0;
              }
              .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 10px; margin: 10px 0; border-radius: 5px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Land of Leads</h1>
                <p>Your Leads Are Ready!</p>
              </div>
              <div class="content">
                <h2>Download Your ${orderData.tier.toUpperCase()} Tier Leads</h2>
                <p>Great news! Your ${orderData.leadCount} leads are ready for download.</p>
                
                <a href="${downloadUrl}" class="button">
                  Download Leads (CSV)
                </a>
                
                <div class="warning">
                  <strong>⚠️ Important:</strong> This download link will expire in 24 hours. Please download your leads as soon as possible.
                </div>
                
                <h3>What's Included:</h3>
                <ul>
                  <li>Business Name & Owner Information</li>
                  <li>Contact Details (Email & Phone)</li>
                  <li>Industry & Revenue Information</li>
                  <li>AI Quality Score (${orderData.minQuality}-${orderData.maxQuality} range)</li>
                </ul>
                
                <p><strong>Need help?</strong> Visit our dashboard or contact support.</p>
              </div>
              <div class="footer">
                <p>© 2025 Land of Leads. All rights reserved.</p>
                <p>Questions? Contact us at support@landofleads.com</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('Failed to send download ready email:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Error sending download ready email:', err);
    return { success: false, error: err };
  }
}

export async function sendAdminAlert(subject: string, message: string, details?: any) {
  try {
    const { data, error } = await resend.emails.send({
      from: `Land of Leads System <${FROM_EMAIL}>`,
      to: [ADMIN_EMAIL],
      subject: `[Admin Alert] ${subject}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background: #f5f5f5; }
              .footer { padding: 20px; text-align: center; color: #666; }
              .details { background: white; padding: 15px; border-radius: 5px; margin: 10px 0; }
              pre { background: #f4f4f4; padding: 10px; overflow-x: auto; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🚨 Admin Alert</h1>
                <p>${subject}</p>
              </div>
              <div class="content">
                <p>${message}</p>
                
                ${details ? `
                  <div class="details">
                    <h3>Details:</h3>
                    <pre>${JSON.stringify(details, null, 2)}</pre>
                  </div>
                ` : ''}
                
                <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
              </div>
              <div class="footer">
                <p>This is an automated admin notification from Land of Leads.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('Failed to send admin alert:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Error sending admin alert:', err);
    return { success: false, error: err };
  }
}

export async function sendAlertNotification(to: string, alertData: any) {
  try {
    const { data, error } = await resend.emails.send({
      from: `Land of Leads Alerts <${FROM_EMAIL}>`,
      to: [to],
      subject: `🔔 New Leads Match Your Alert: ${alertData.alertName}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { padding: 25px; background: #f8f9fa; }
              .alert-info { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
              .lead-preview { background: white; padding: 15px; border-left: 4px solid #667eea; margin: 10px 0; border-radius: 4px; }
              .stats { display: flex; justify-content: space-around; padding: 15px 0; }
              .stat { text-align: center; }
              .stat-value { font-size: 24px; font-weight: bold; color: #667eea; }
              .stat-label { color: #666; font-size: 14px; }
              .footer { padding: 20px; text-align: center; color: #666; background: #f8f9fa; border-radius: 0 0 10px 10px; }
              .button { 
                display: inline-block; 
                padding: 14px 28px; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                color: white; 
                text-decoration: none; 
                border-radius: 6px;
                margin: 15px 0;
                font-weight: bold;
              }
              .badge { 
                display: inline-block; 
                padding: 4px 8px; 
                background: #e3f2fd; 
                color: #1976d2; 
                border-radius: 4px; 
                font-size: 12px;
                margin: 0 4px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎯 Lead Alert Triggered!</h1>
                <p style="font-size: 18px; margin: 0;">${alertData.alertName}</p>
              </div>
              <div class="content">
                <div class="alert-info">
                  <div class="stats">
                    <div class="stat">
                      <div class="stat-value">${alertData.matchedCount}</div>
                      <div class="stat-label">New Matching Leads</div>
                    </div>
                  </div>
                </div>
                
                <h3>📊 Sample of Matched Leads:</h3>
                ${alertData.sampleLeads.map((lead: any) => `
                  <div class="lead-preview">
                    <strong>${lead.businessName}</strong>
                    <div style="margin-top: 8px; color: #666;">
                      <span class="badge">${lead.industry}</span>
                      <span class="badge">${lead.state}</span>
                      <span class="badge">Revenue: ${lead.revenue}</span>
                      <span class="badge">Quality: ${lead.qualityScore}/100</span>
                    </div>
                  </div>
                `).join('')}
                
                ${alertData.matchedCount > 5 ? `
                  <p style="text-align: center; color: #666; margin-top: 15px;">
                    ... and ${alertData.matchedCount - 5} more leads
                  </p>
                ` : ''}
                
                <div style="text-align: center; margin-top: 25px;">
                  <a href="${alertData.viewUrl}" class="button">
                    View All Matched Leads
                  </a>
                </div>
                
                <div style="background: #e8f5e9; padding: 15px; border-radius: 6px; margin-top: 20px;">
                  <p style="margin: 0; color: #2e7d32;">
                    <strong>💡 Pro Tip:</strong> Act quickly! High-quality leads are often purchased within hours of becoming available.
                  </p>
                </div>
              </div>
              <div class="footer">
                <p>This alert was automatically generated based on your saved criteria.</p>
                <p>To manage your alerts, visit your <a href="${process.env.VITE_SITE_URL || 'http://localhost:5000'}/alerts" style="color: #667eea;">Alert Dashboard</a></p>
                <p style="margin-top: 15px; font-size: 12px;">© 2025 Land of Leads. All rights reserved.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('Failed to send alert notification:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Error sending alert notification:', err);
    return { success: false, error: err };
  }
}

export async function sendContactFormNotification(contactData: any) {
  try {
    // Send notification to admin
    const adminResult = await resend.emails.send({
      from: `Land of Leads Contact <${FROM_EMAIL}>`,
      to: [ADMIN_EMAIL],
      replyTo: contactData.email,
      subject: `New Contact Form Submission from ${contactData.name}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #17a2b8; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background: #f5f5f5; }
              .footer { padding: 20px; text-align: center; color: #666; }
              .field { margin: 10px 0; }
              .field strong { display: inline-block; width: 100px; }
              .message-box { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>📧 New Contact Form Submission</h1>
              </div>
              <div class="content">
                <h2>Contact Details</h2>
                <div class="field"><strong>Name:</strong> ${contactData.name}</div>
                <div class="field"><strong>Email:</strong> ${contactData.email}</div>
                <div class="field"><strong>Phone:</strong> ${contactData.phone || 'Not provided'}</div>
                <div class="field"><strong>Company:</strong> ${contactData.company || 'Not provided'}</div>
                
                <h2>Message</h2>
                <div class="message-box">
                  ${contactData.message}
                </div>
                
                <p><strong>Submitted at:</strong> ${new Date().toLocaleString()}</p>
              </div>
              <div class="footer">
                <p>Reply directly to this email to respond to the customer.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    // Send auto-reply to submitter
    const autoReplyResult = await resend.emails.send({
      from: `Land of Leads <${FROM_EMAIL}>`,
      to: [contactData.email],
      subject: `We've Received Your Message - Land of Leads`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #1976d2; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background: #f5f5f5; }
              .footer { padding: 20px; text-align: center; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Land of Leads</h1>
                <p>Thank You for Contacting Us!</p>
              </div>
              <div class="content">
                <p>Hi ${contactData.name},</p>
                
                <p>Thank you for reaching out to Land of Leads. We've received your message and one of our team members will get back to you within 24 hours.</p>
                
                <h3>Your Message:</h3>
                <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
                  ${contactData.message}
                </div>
                
                <p>In the meantime, feel free to explore our website to learn more about our MCA lead packages and pricing tiers.</p>
                
                <p>Best regards,<br>The Land of Leads Team</p>
              </div>
              <div class="footer">
                <p>© 2025 Land of Leads. All rights reserved.</p>
                <p>This is an automated response. A team member will follow up shortly.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    if (adminResult.error || autoReplyResult.error) {
      console.error('Email sending errors:', { adminResult, autoReplyResult });
      return { 
        success: false, 
        error: adminResult.error || autoReplyResult.error 
      };
    }

    return { success: true, data: { adminResult, autoReplyResult } };
  } catch (err) {
    console.error('Error sending contact form notifications:', err);
    return { success: false, error: err };
  }
}

export async function sendPurchaseNotification(purchaseData: any) {
  const { user, tier, leadCount, totalAmount } = purchaseData;
  
  // Send confirmation to buyer
  await sendOrderConfirmation(user.email, {
    id: purchaseData.id,
    tier,
    leadCount,
    totalAmount,
  });
  
  // Send alert to admin
  await sendAdminAlert(
    'New Purchase Completed',
    `${user.username} (${user.email}) has purchased the ${tier} tier package.`,
    {
      purchaseId: purchaseData.id,
      user: user.username,
      email: user.email,
      tier,
      leadCount,
      amount: `$${totalAmount}`,
      timestamp: new Date().toISOString(),
    }
  );
}