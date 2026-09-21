import { describe, expect, it } from 'vitest';
import i18n from '../../src/renderer/i18n/index.js';

function keys(value:unknown,prefix=''):string[]{if(!value||typeof value!=='object')return[prefix];return Object.entries(value as Record<string,unknown>).flatMap(([key,child])=>keys(child,prefix?`${prefix}.${key}`:key));}

describe('English and Bengali localization',()=>{
  it('has complete key parity without blank or corrupted values',()=>{const en=i18n.getResourceBundle('en','translation') as Record<string,unknown>;const bn=i18n.getResourceBundle('bn','translation') as Record<string,unknown>;expect(keys(bn).sort()).toEqual(keys(en).sort());for(const value of [...Object.values(en),...Object.values(bn)])expect(value).not.toBe('');expect(JSON.stringify(bn)).not.toContain('�');});
  it('switches language and returns professional Bengali UI labels',async()=>{await i18n.changeLanguage('bn');expect(i18n.t('billing.financialSafety')).toContain('আর্থিক');expect(i18n.t('clinical.safety')).toContain('স্বয়ংক্রিয়ভাবে');await i18n.changeLanguage('en');expect(i18n.t('patients.emptyBody')).toContain('without fabricated patient data');});
});
