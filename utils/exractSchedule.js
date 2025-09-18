/**
 * Extract schedule information from text
 * @param {string} text - Raw text from PDF or OCR
 * @returns {Promise<Array>} - Array of schedule objects {subject, time, day}
 */
async function extractSchedule(text) {
  try {
    console.log('📅 Starting schedule extraction...');

    if (!text || text.trim().length === 0) {
      console.log('⚠️ No text provided for schedule extraction');
      return [];
    }

    const schedule = [];
    const lines = text
      .split('\n')
      .map(line => line.replace(/\s{2,}/g, ' ').trim())
      .filter(line => line.length > 0);
    try { console.log('🧪 First 10 lines:', lines.slice(0, 10)); } catch (_) {}

    // Time patterns with names to drive normalization
    const timePatterns = [
      { name: 'hh:mm ampm', regex: /(\d{1,2}):(\d{2})\s*(AM|PM)/gi },     // 9:00 AM
      { name: 'hh:mm',       regex: /(\d{1,2}):(\d{2})/g },                // 9:00, 14:30
      { name: 'h ampm',      regex: /(\d{1,2})\s*(AM|PM)/gi },             // 9 AM
      { name: 'h.mm',        regex: /(\d{1,2})\.(\d{2})/g },              // 9.00
      { name: 'digits-range',regex: /\b(\d{3,4})\s*-\s*(\d{3,4})\b/g }, // 930-1020
    ];

    // Day patterns (full, 3-letter, and 2-letter like Mo/Tu/We/Th/Fr)
    const dayPatterns = [
      /\b(monday|mon)\b/gi,
      /\b(tuesday|tue)\b/gi,
      /\b(wednesday|wed)\b/gi,
      /\b(thursday|thu)\b/gi,
      /\b(friday|fri)\b/gi,
      /\b(saturday|sat)\b/gi,
      /\b(sunday|sun)\b/gi,
      /\b(mo|tu|we|th|fr|sa|su)\b/gi,
    ];

    // Common subject keywords to help labeling
    const subjectKeywords = [
      'math', 'mathematics', 'calculus', 'algebra', 'geometry',
      'english', 'literature', 'writing', 'grammar',
      'science', 'physics', 'chemistry', 'biology',
      'history', 'geography', 'social', 'studies',
      'computer', 'programming', 'coding', 'it', 'cs', 'cse',
      'economics', 'psychology', 'philosophy',
      'language', 'spanish', 'french', 'german',
      'lecture', 'lab', 'tutorial', 'seminar',
      'class', 'course', 'subject'
    ];

    function parseCompactDigitsToHM(digits) {
      // digits: '930' => { h24: 9, m: 30 }, '1210' => { h24: 12, m: 10 }
      const n = parseInt(digits, 10);
      if (Number.isNaN(n)) return null;
      const h = Math.floor(n / 100);
      const m = n % 100;
      if (m >= 60 || h > 23 || h < 0) return null; // invalid
      return { h24: h, m };
    }

    function isValidHM(hr, min, { format = '24' } = {}) {
      if (!Number.isInteger(hr) || !Number.isInteger(min)) return false;
      if (min < 0 || min > 59) return false;
      if (format === '12') return hr >= 1 && hr <= 12;
      return hr >= 0 && hr <= 23;
    }

    function toAmPm(h24, m) {
      // Convert 24h -> 12h AM/PM; heuristic AM for <12 except 0=>12AM; PM for >=12
      let hours = h24;
      let ampm = 'AM';
      if (hours === 0) {
        hours = 12; ampm = 'AM';
      } else if (hours === 12) {
        ampm = 'PM';
      } else if (hours > 12) {
        hours = hours - 12; ampm = 'PM';
      } else {
        ampm = 'AM';
      }
      const mm = String(m).padStart(2, '0');
      return `${hours}:${mm} ${ampm}`;
    }

    function normalizeDigitsRange(a, b) {
      const start = parseCompactDigitsToHM(a);
      const end = parseCompactDigitsToHM(b);
      if (!start || !end) return null;
      // Drop zero-length or negative (end before start) ranges to avoid OCR noise like 1538-1025
      const startMins = start.h24 * 60 + start.m;
      const endMins = end.h24 * 60 + end.m;
      if (endMins <= startMins) return null;
      // Optional: enforce reasonable class duration (>= 15 min, <= 6 hrs)
      const dur = endMins - startMins;
      if (dur < 15 || dur > 360) return null;
      const s = toAmPm(start.h24, start.m);
      const e = toAmPm(end.h24, end.m);
      return `${s} - ${e}`;
    }

    // Process each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const prevLine = lines[i - 1] || '';
      const nextLine = lines[i + 1] || '';
      const combinedLine = `${prevLine} ${line} ${nextLine}`;

      // Pre-pass: extract explicit hh:mm - hh:mm ranges to avoid treating singles as times
      const hhmmRangeRegex = /(\d{1,2}):(\d{2})\s*(?:-|–|to)\s*(\d{1,2}):(\d{2})/gi;
      const rangeMatches = [...line.matchAll(hhmmRangeRegex)];
      if (rangeMatches.length) {
        for (const rm of rangeMatches) {
          const h1 = parseInt(rm[1], 10);
          const m1 = parseInt(rm[2], 10);
          const h2 = parseInt(rm[3], 10);
          const m2 = parseInt(rm[4], 10);
          if (!isValidHM(h1, m1, { format: '24' }) || !isValidHM(h2, m2, { format: '24' })) continue;
          const startMins = (h1 > 23 ? 0 : h1) * 60 + m1;
          const endMins = (h2 > 23 ? 0 : h2) * 60 + m2;
          if (endMins <= startMins) continue;
          const dur = endMins - startMins;
          if (dur < 15 || dur > 360) continue;
          const timeStr = `${toAmPm(h1, m1)} - ${toAmPm(h2, m2)}`;

          // Subject detection (same as later logic)
          let subject = '';
          const lowerLine = line.toLowerCase();
          for (const keyword of subjectKeywords) {
            if (lowerLine.includes(keyword)) {
              const words = line.split(/\s+/);
              const idx = words.findIndex(w => w.toLowerCase().includes(keyword));
              if (idx !== -1) {
                subject = words[idx];
                if (idx > 0) subject = `${words[idx - 1]} ${subject}`;
                if (idx < words.length - 1) subject = `${subject} ${words[idx + 1]}`;
                subject = subject.replace(/[^\w\s]/g, '').trim();
                break;
              }
            }
          }
          if (!subject) {
            const candidates = [prevLine, line, nextLine]
              .filter(Boolean)
              .map(s => s.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Mo|Tu|We|Th|Fr|Sa|Su)\b/gi, ''))
              .map(s => s.replace(/\b\d{1,2}[:\.][\d]{2}\s*(AM|PM)?\b/gi, ''))
              .map(s => s.replace(/\b\d{3,4}\s*-\s*\d{3,4}\b/g, ''))
              .map(s => s.replace(/[^\w\s\-]/g, ''))
              .map(s => s.trim())
              .filter(s => s.length > 1 && s.length <= 60);
            subject = candidates.find(s => /[A-Za-z]/.test(s)) || 'Class';
          }

          // Day detection
          let day = '';
          for (const dp of dayPatterns) {
            const hit = combinedLine.match(dp);
            if (hit && hit[0]) {
              const d = hit[0];
              day = d.length <= 2
                ? d.toUpperCase()
                : d.charAt(0).toUpperCase() + d.slice(1).toLowerCase();
              break;
            }
          }

          subject = subject
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (subject.length < 2) subject = 'Class';

          schedule.push({ subject, time: timeStr, day: day || 'Daily' });
        }
        // Avoid re-processing simple hh:mm on the same line (which would add noisy singles)
      }

      for (const pat of timePatterns) {
        const matches = [...line.matchAll(pat.regex)];
        if (matches.length === 0) continue;

        for (const m of matches) {
          let timeStr = m[0];

          // Normalize time
          if (pat.name === 'hh:mm ampm') {
            const hr = parseInt(m[1], 10);
            const min = parseInt(m[2], 10);
            if (!isValidHM(hr, min, { format: '12' })) continue;
            const ampm = m[3].toUpperCase();
            timeStr = `${hr}:${String(min).padStart(2, '0')} ${ampm}`;
          } else if (pat.name === 'hh:mm') {
            // Skip if this line already produced hh:mm range entries to avoid duplicates
            if (/(\d{1,2}):(\d{2})\s*(?:-|–|to)\s*(\d{1,2}):(\d{2})/i.test(line)) {
              continue;
            }
            const hr24 = parseInt(m[1], 10);
            const min = parseInt(m[2], 10);
            if (!isValidHM(hr24, min, { format: '24' })) continue;
            // Require extra context (day indicators) to accept single hh:mm without am/pm
            const hasDayContext = dayPatterns.some(dp => dp.test(combinedLine));
            if (!hasDayContext) continue;
            const ampm = hr24 >= 12 ? 'PM' : 'AM';
            const hr12 = hr24 > 12 ? hr24 - 12 : (hr24 === 0 ? 12 : hr24);
            timeStr = `${hr12}:${String(min).padStart(2, '0')} ${ampm}`;
          } else if (pat.name === 'h ampm') {
            const hr = parseInt(m[1], 10);
            const ampm = m[2].toUpperCase();
            if (!isValidHM(hr, 0, { format: '12' })) continue;
            timeStr = `${hr}:00 ${ampm}`;
          } else if (pat.name === 'h.mm') {
            const hr24 = parseInt(m[1], 10);
            const min = parseInt(m[2], 10);
            if (!isValidHM(hr24, min, { format: '24' })) continue;
            const ampm = hr24 >= 12 ? 'PM' : 'AM';
            const hr12 = hr24 > 12 ? hr24 - 12 : (hr24 === 0 ? 12 : hr24);
            timeStr = `${hr12}:${String(min).padStart(2, '0')} ${ampm}`;
          } else if (pat.name === 'digits-range') {
            const a = m[1];
            const b = m[2];
            const normalized = normalizeDigitsRange(a, b);
            if (!normalized) continue;
            timeStr = normalized;
          }

          // Subject detection
          let subject = '';
          const lowerLine = line.toLowerCase();
          for (const keyword of subjectKeywords) {
            if (lowerLine.includes(keyword)) {
              const words = line.split(/\s+/);
              const idx = words.findIndex(w => w.toLowerCase().includes(keyword));
              if (idx !== -1) {
                subject = words[idx];
                if (idx > 0) subject = `${words[idx - 1]} ${subject}`;
                if (idx < words.length - 1) subject = `${subject} ${words[idx + 1]}`;
                subject = subject.replace(/[^\w\s]/g, '').trim();
                break;
              }
            }
          }

          if (!subject) {
            // Heuristic: choose a nearby non-day/time phrase
            const candidates = [prevLine, line, nextLine]
              .filter(Boolean)
              .map(s => s.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Mo|Tu|We|Th|Fr|Sa|Su)\b/gi, ''))
              .map(s => s.replace(/\b\d{1,2}[:\.][\d]{2}\s*(AM|PM)?\b/gi, ''))
              .map(s => s.replace(/\b\d{3,4}\s*-\s*\d{3,4}\b/g, '')) // remove compact ranges
              .map(s => s.replace(/[^\w\s\-]/g, ''))
              .map(s => s.trim())
              .filter(s => s.length > 1 && s.length <= 60);
            subject = candidates.find(s => /[A-Za-z]/.test(s)) || 'Class';
          }

          // Day detection
          let day = '';
          for (const dp of dayPatterns) {
            const hit = combinedLine.match(dp);
            if (hit && hit[0]) {
              const d = hit[0];
              day = d.length <= 2
                ? d.toUpperCase() // Mo, Tu, etc.
                : d.charAt(0).toUpperCase() + d.slice(1).toLowerCase();
              break;
            }
          }

          // Cleanup subject
          subject = subject
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (subject.length < 2) subject = 'Class';

          schedule.push({ subject, time: timeStr, day: day || 'Daily' });
        }
      }
    }

    // De-duplicate
    const uniqueSchedule = schedule.filter((item, index, self) =>
      index === self.findIndex(t => t.subject === item.subject && t.time === item.time && t.day === item.day)
    );

    // Sort by start time
    uniqueSchedule.sort((a, b) => convertTimeToMinutes(a.time) - convertTimeToMinutes(b.time));

    console.log(`✅ Schedule extraction completed. Found ${uniqueSchedule.length} schedule items`);
    try { console.log('🗓️ Preview:', uniqueSchedule.slice(0, 5)); } catch (_) {}

    return uniqueSchedule;
  } catch (error) {
    console.error('❌ Schedule extraction error:', error.message);
    return [];
  }
}

/**
 * Convert time string to minutes for sorting
 * Accepts: "h:mm AM/PM" or ranges like "h:mm AM/PM - ..." (uses start)
 */
function convertTimeToMinutes(timeStr) {
  try {
    const start = timeStr.split('-')[0].trim();
    const ap = start.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (ap) {
      let h = parseInt(ap[1], 10);
      const m = parseInt(ap[2], 10);
      const ampm = ap[3].toUpperCase();
      if (ampm === 'PM' && h !== 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      return h * 60 + m;
    }
    const noap = start.match(/(\d{1,2}):(\d{2})/);
    if (noap) {
      let h = parseInt(noap[1], 10);
      const m = parseInt(noap[2], 10);
      if (h > 23) h = 0;
      return h * 60 + m;
    }
    return 0;
  } catch (_) {
    return 0;
  }
}

module.exports = extractSchedule;