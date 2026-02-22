import { describe, it, expect } from 'vitest';
import {
  CHARACTERS,
  CHARACTER_LIST,
  DEFAULT_CHARACTER_ID,
  getCharacter,
  isValidCharacterId,
} from '@/lib/characters';

describe('Characters module', () => {
  describe('CHARACTERS', () => {
    it('contains three characters', () => {
      expect(Object.keys(CHARACTERS)).toHaveLength(3);
    });

    it('has mei, thornberry, and ryan', () => {
      expect(CHARACTERS).toHaveProperty('mei');
      expect(CHARACTERS).toHaveProperty('thornberry');
      expect(CHARACTERS).toHaveProperty('ryan');
    });

    it('each character has required fields', () => {
      for (const char of Object.values(CHARACTERS)) {
        expect(char).toHaveProperty('id');
        expect(char).toHaveProperty('name');
        expect(char).toHaveProperty('emoji');
        expect(char).toHaveProperty('tagline');
        expect(char).toHaveProperty('color');
        expect(char).toHaveProperty('classes');
        expect(char).toHaveProperty('voiceConfig');
        expect(char).toHaveProperty('persona');
        expect(typeof char.persona).toBe('string');
        expect(char.persona.length).toBeGreaterThan(0);
      }
    });
  });

  describe('CHARACTER_LIST', () => {
    it('has the same length as CHARACTERS keys', () => {
      expect(CHARACTER_LIST).toHaveLength(Object.keys(CHARACTERS).length);
    });

    it('contains all character objects', () => {
      for (const char of Object.values(CHARACTERS)) {
        expect(CHARACTER_LIST).toContainEqual(char);
      }
    });
  });

  describe('DEFAULT_CHARACTER_ID', () => {
    it('is mei', () => {
      expect(DEFAULT_CHARACTER_ID).toBe('mei');
    });

    it('exists in CHARACTERS', () => {
      expect(CHARACTERS[DEFAULT_CHARACTER_ID]).toBeDefined();
    });
  });

  describe('getCharacter', () => {
    it('returns mei character', () => {
      const mei = getCharacter('mei');
      expect(mei.id).toBe('mei');
      expect(mei.name).toBe('梅老师');
      expect(mei.color).toBe('rose');
    });

    it('returns thornberry character', () => {
      const thornberry = getCharacter('thornberry');
      expect(thornberry.id).toBe('thornberry');
      expect(thornberry.name).toBe('Thornberry 先生');
      expect(thornberry.color).toBe('slate');
    });

    it('returns ryan character', () => {
      const ryan = getCharacter('ryan');
      expect(ryan.id).toBe('ryan');
      expect(ryan.name).toBe('Ryan 教练');
      expect(ryan.color).toBe('orange');
    });
  });

  describe('isValidCharacterId', () => {
    it('returns true for valid character ids', () => {
      expect(isValidCharacterId('mei')).toBe(true);
      expect(isValidCharacterId('thornberry')).toBe(true);
      expect(isValidCharacterId('ryan')).toBe(true);
    });

    it('returns false for invalid character ids', () => {
      expect(isValidCharacterId('unknown')).toBe(false);
      expect(isValidCharacterId('')).toBe(false);
      expect(isValidCharacterId('MEI')).toBe(false);
    });
  });
});
