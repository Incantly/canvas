import { Pressable, Text, View, StyleSheet } from 'react-native'

interface DemoToolbarProps {
  actions: { label: string; onPress: () => void; disabled?: boolean }[]
}

export function DemoToolbar({ actions }: DemoToolbarProps) {
  return (
    <View style={styles.row}>
      {actions.map((action) => (
        <Pressable
          key={action.label}
          onPress={action.onPress}
          disabled={action.disabled}
          style={[styles.btn, action.disabled && styles.btnDisabled]}
        >
          <Text style={styles.btnText}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: {
    backgroundColor: '#1967d2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
})
